import { describe, expect, it } from "vitest";
import { DEFAULT_DOCUMENT, DEFAULT_SETTINGS } from "../data/sampleData";
import { getPalette } from "../data/palettes";
import type { SankeyRow } from "../types";
import {
  resolveLinkGroupColors,
  resolveNodeColors,
  summarizeNodeColorMapping,
} from "./colors";
import { buildSankeyLayout } from "./sankey";

const palette = ["#111111", "#222222", "#333333"];

function graph(rows: SankeyRow[]) {
  return buildSankeyLayout(rows, DEFAULT_SETTINGS, 1100, 720).graph;
}

describe("resolveNodeColors", () => {
  it("keeps node colors stable when row order changes", () => {
    const rows: SankeyRow[] = [
      { id: "1", source: "A", target: "B", value: 6 },
      { id: "2", source: "A", target: "C", value: 4 },
    ];
    const first = resolveNodeColors(graph(rows), palette, {}, "individual");
    const second = resolveNodeColors(
      graph([...rows].reverse()),
      palette,
      {},
      "individual",
    );

    expect(second.get("A")).toBe(first.get("A"));
    expect(second.get("B")).toBe(first.get("B"));
    expect(second.get("C")).toBe(first.get("C"));
  });

  it("honors a saved custom color", () => {
    const rows: SankeyRow[] = [
      { id: "1", source: "A", target: "B", value: 1 },
    ];
    const colors = resolveNodeColors(
      graph(rows),
      palette,
      { A: "#ABCDEF" },
      "stage",
    );

    expect(colors.get("A")).toBe("#ABCDEF");
  });

  it("uses one color per stage without depending on node names", () => {
    const rows: SankeyRow[] = [
      { id: "1", source: "A", target: "B", value: 6 },
      { id: "2", source: "A", target: "C", value: 4 },
      { id: "3", source: "B", target: "D", value: 6 },
      { id: "4", source: "C", target: "D", value: 4 },
    ];
    const colors = resolveNodeColors(graph(rows), palette, {}, "stage");

    expect(colors.get("B")).toBe(colors.get("C"));
    expect(colors.get("A")).not.toBe(colors.get("B"));
    expect(colors.get("D")).not.toBe(colors.get("B"));
  });

  it("maps declared node groups and keeps ungrouped nodes neutral", () => {
    const rows: SankeyRow[] = [
      {
        id: "1",
        source: "A",
        sourceGroup: "入口",
        target: "B",
        targetGroup: "处理",
        value: 1,
      },
      { id: "2", source: "B", target: "C", value: 1 },
    ];
    const colors = resolveNodeColors(graph(rows), palette, {}, "group");

    expect(colors.get("A")).not.toBe(colors.get("B"));
    expect(colors.get("C")).toBe("#94A3B8");
  });

  it("reports palette capacity without treating intentional group reuse as a collision", () => {
    const rows: SankeyRow[] = [
      { id: "1", source: "A", target: "B", value: 1 },
      { id: "2", source: "A", target: "C", value: 1 },
      { id: "3", source: "A", target: "D", value: 1 },
    ];
    const summary = summarizeNodeColorMapping(graph(rows), "individual", 2);

    expect(summary.categoryCount).toBe(4);
    expect(summary.repeatsColors).toBe(true);
  });

  it("keeps a shared group color consistent between nodes and ribbons", () => {
    const rows: SankeyRow[] = [
      {
        id: "1",
        source: "A",
        sourceGroup: "共同分组",
        target: "B",
        targetGroup: "结果",
        linkGroup: "共同分组",
        value: 1,
      },
    ];
    const layout = graph(rows);
    const nodeColors = resolveNodeColors(layout, palette, {}, "group");
    const linkColors = resolveLinkGroupColors(layout, palette);

    expect(nodeColors.get("A")).toBe(linkColors.get("共同分组"));
  });

  it("gives every node in the default example a unique color", () => {
    const layout = buildSankeyLayout(
      DEFAULT_DOCUMENT.rows,
      DEFAULT_DOCUMENT.settings,
      1100,
      720,
    ).graph;
    const activePalette = getPalette(DEFAULT_DOCUMENT.settings.paletteId);
    const colors = resolveNodeColors(
      layout,
      activePalette.colors,
      {},
      DEFAULT_DOCUMENT.settings.nodeColorMode,
    );

    expect(colors.size).toBe(9);
    expect(new Set(colors.values()).size).toBe(colors.size);
  });
});
