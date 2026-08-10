import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../data/sampleData";
import type { SankeyRow } from "../types";
import {
  applyNodePositions,
  buildSankeyLayout,
  getNodeId,
  getSankeyColumns,
  resolveNodeDragPositions,
  resolveNodeKeyboardPositions,
  sankeyAlignmentsHaveVisibleEffect,
  type LayoutNode,
} from "./sankey";

function makeRows(
  values: Array<[string, string, number]>,
): SankeyRow[] {
  return values.map(([source, target, value], index) => ({
    id: String(index),
    source,
    target,
    value,
  }));
}

describe("buildSankeyLayout", () => {
  it("builds a deterministic acyclic graph", () => {
    const result = buildSankeyLayout(
      makeRows([
        ["A", "B", 10],
        ["B", "C", 6],
      ]),
      DEFAULT_SETTINGS,
      1100,
      720,
    );

    expect(result.error).toBeNull();
    expect(result.graph?.nodes).toHaveLength(3);
    expect(result.graph?.links).toHaveLength(2);
  });

  it("groups nodes into ordered visual columns", () => {
    const result = buildSankeyLayout(
      makeRows([
        ["A", "B", 6],
        ["A", "C", 4],
        ["B", "D", 6],
        ["C", "D", 4],
      ]),
      DEFAULT_SETTINGS,
      1100,
      720,
    );

    const columns = getSankeyColumns(result.graph);

    expect(columns.map((column) => column.nodeIds)).toEqual([
      ["A"],
      ["B", "C"],
      ["D"],
    ]);
    expect(columns.map((column) => column.index)).toEqual([0, 1, 2]);
    expect(columns[0].x).toBeLessThan(columns[1].x);
    expect(columns[1].x).toBeLessThan(columns[2].x);
  });

  it("reports when the topology makes every horizontal alignment identical", () => {
    const graph = buildSankeyLayout(
      makeRows([
        ["A", "B", 6],
        ["A", "C", 4],
        ["B", "D", 6],
        ["C", "D", 4],
      ]),
      DEFAULT_SETTINGS,
      1100,
      720,
    ).graph;

    expect(sankeyAlignmentsHaveVisibleEffect(graph)).toBe(false);
  });

  it("reports a visible alignment choice for an early terminal node", () => {
    const rows = makeRows([
      ["A", "B", 6],
      ["B", "C", 6],
      ["A", "D", 4],
    ]);
    const justified = buildSankeyLayout(
      rows,
      { ...DEFAULT_SETTINGS, alignment: "justify" },
      1100,
      720,
    ).graph!;
    const left = buildSankeyLayout(
      rows,
      { ...DEFAULT_SETTINGS, alignment: "left" },
      1100,
      720,
    ).graph!;
    const justifiedD = justified.nodes.find((node) => getNodeId(node) === "D")!;
    const leftD = left.nodes.find((node) => getNodeId(node) === "D")!;

    expect(sankeyAlignmentsHaveVisibleEffect(justified)).toBe(true);
    expect(justifiedD.x0).toBeGreaterThan(leftD.x0!);
  });

  it("keeps every ribbon endpoint inside its source and target node", () => {
    const graph = buildSankeyLayout(
      makeRows([
        ["A", "B", 6],
        ["A", "C", 4],
        ["B", "D", 5],
        ["B", "E", 1],
        ["C", "E", 4],
      ]),
      DEFAULT_SETTINGS,
      1100,
      720,
    ).graph!;

    graph.links.forEach((link) => {
      const source = link.source as LayoutNode;
      const target = link.target as LayoutNode;
      const halfWidth = Number(link.width ?? 0) / 2;
      expect(Number(link.y0) - halfWidth).toBeGreaterThanOrEqual(source.y0! - 1e-8);
      expect(Number(link.y0) + halfWidth).toBeLessThanOrEqual(source.y1! + 1e-8);
      expect(Number(link.y1) - halfWidth).toBeGreaterThanOrEqual(target.y0! - 1e-8);
      expect(Number(link.y1) + halfWidth).toBeLessThanOrEqual(target.y1! + 1e-8);
    });
  });

  it("returns a readable message for cycles", () => {
    const result = buildSankeyLayout(
      makeRows([
        ["A", "B", 10],
        ["B", "A", 5],
      ]),
      DEFAULT_SETTINGS,
      1100,
      720,
    );

    expect(result.graph).toBeNull();
    expect(result.error).toContain("循环流");
  });

  it("moves a node vertically and recomputes its connected ribbons", () => {
    const result = buildSankeyLayout(
      makeRows([
        ["A", "B", 6],
        ["A", "C", 4],
      ]),
      DEFAULT_SETTINGS,
      1100,
      720,
    );
    const graph = result.graph!;
    const nodeB = graph.nodes.find((node) => getNodeId(node) === "B")!;
    const incoming = graph.links.find(
      (link) => getNodeId(link.target as LayoutNode) === "B",
    )!;
    const initialLinkY = incoming.y1;

    const positions = resolveNodeDragPositions(
      graph,
      "B",
      500,
      720,
      DEFAULT_SETTINGS.nodePadding,
    );
    applyNodePositions(
      graph,
      positions,
      720,
      DEFAULT_SETTINGS.nodePadding,
    );

    expect(nodeB.y0).toBeGreaterThan(300);
    expect(incoming.y1).not.toBe(initialLinkY);
    expect(incoming.y1).toBeGreaterThanOrEqual(nodeB.y0!);
    expect(incoming.y1).toBeLessThanOrEqual(nodeB.y1!);
  });

  it("keeps manually positioned nodes inside the artboard", () => {
    const result = buildSankeyLayout(
      makeRows([
        ["A", "B", 6],
        ["A", "C", 4],
      ]),
      DEFAULT_SETTINGS,
      1100,
      720,
    );
    const graph = result.graph!;
    const nodeB = graph.nodes.find((node) => getNodeId(node) === "B")!;

    applyNodePositions(
      graph,
      { B: { y: -500 } },
      720,
      DEFAULT_SETTINGS.nodePadding,
    );
    expect(nodeB.y0).toBeCloseTo(72);

    applyNodePositions(
      graph,
      { B: { y: 5_000 } },
      720,
      DEFAULT_SETTINGS.nodePadding,
    );
    expect(nodeB.y1).toBeLessThanOrEqual(720 - 86);
  });

  it("reorders dragged neighbours while preserving the configured gap", () => {
    const result = buildSankeyLayout(
      makeRows([
        ["A", "B", 6],
        ["A", "C", 4],
      ]),
      DEFAULT_SETTINGS,
      1100,
      720,
    );
    const graph = result.graph!;
    const positions = resolveNodeDragPositions(
      graph,
      "B",
      500,
      720,
      DEFAULT_SETTINGS.nodePadding,
    );

    applyNodePositions(
      graph,
      positions,
      720,
      DEFAULT_SETTINGS.nodePadding,
    );

    const nodeB = graph.nodes.find((node) => getNodeId(node) === "B")!;
    const nodeC = graph.nodes.find((node) => getNodeId(node) === "C")!;
    expect(nodeB.y0! - nodeC.y1!).toBeGreaterThanOrEqual(
      DEFAULT_SETTINGS.nodePadding - 1e-8,
    );
    expect(nodeB.y1).toBeLessThanOrEqual(720 - 86);
  });

  it("repairs overlapping positions from older saved documents", () => {
    const result = buildSankeyLayout(
      makeRows([
        ["A", "B", 6],
        ["A", "C", 4],
      ]),
      DEFAULT_SETTINGS,
      1100,
      720,
    );
    const graph = result.graph!;

    applyNodePositions(
      graph,
      { B: { y: 250 }, C: { y: 250 } },
      720,
      DEFAULT_SETTINGS.nodePadding,
    );

    const [first, second] = graph.nodes
      .filter((node) => ["B", "C"].includes(getNodeId(node)))
      .sort((a, b) => a.y0! - b.y0!);
    expect(second.y0! - first.y1!).toBeGreaterThanOrEqual(
      DEFAULT_SETTINGS.nodePadding - 1e-8,
    );
  });

  it("moves a keyboard-controlled node to the next slot when its column is packed", () => {
    const result = buildSankeyLayout(
      makeRows([
        ["A", "B", 6],
        ["A", "C", 4],
      ]),
      DEFAULT_SETTINGS,
      1100,
      720,
    );
    const graph = result.graph!;
    const nodeB = graph.nodes.find((node) => getNodeId(node) === "B")!;
    const initialY = nodeB.y0!;
    const positions = resolveNodeKeyboardPositions(
      graph,
      "B",
      1,
      720,
      DEFAULT_SETTINGS.nodePadding,
    );

    expect(positions.B.y).toBeGreaterThan(initialY);
  });
});
