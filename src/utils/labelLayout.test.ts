import { describe, expect, it } from "vitest";
import type { LabelPosition } from "../types";
import {
  alignLabels,
  buildLabelPositions,
  countLabelOverlaps,
  estimateLabelBox,
  formatNumber,
  getLabelLines,
  getLeaderLineGeometry,
  shouldShowLeaderLine,
} from "./labelLayout";
import {
  DEFAULT_DOCUMENT,
  DEFAULT_SETTINGS,
  SAMPLE_DOCUMENTS,
} from "../data/sampleData";
import { buildPercentageSummary } from "./percentages";
import { buildSankeyLayout } from "./sankey";

const labels: LabelPosition[] = [
  { id: "a", x: 20, y: 20, width: 20, height: 10, locked: false },
  { id: "b", x: 60, y: 50, width: 40, height: 10, locked: false },
  { id: "c", x: 100, y: 80, width: 20, height: 10, locked: false },
];

describe("shouldShowLeaderLine", () => {
  const automatic = { x: 100, y: 80, leaderLine: false };

  it("shows a manually moved line only after the configured threshold", () => {
    expect(
      shouldShowLeaderLine(
        { x: 112, y: 96 },
        automatic,
        true,
        true,
        20,
      ),
    ).toBe(false);
    expect(
      shouldShowLeaderLine(
        { x: 121, y: 80 },
        automatic,
        true,
        true,
        20,
      ),
    ).toBe(true);
  });

  it("hides manual lines after returning near the automatic position", () => {
    expect(
      shouldShowLeaderLine(
        { x: 101, y: 79 },
        automatic,
        true,
        true,
        20,
      ),
    ).toBe(false);
  });

  it("keeps required automatic lines while honoring the global switch", () => {
    const detached = { ...automatic, leaderLine: true };
    expect(
      shouldShowLeaderLine(detached, detached, false, true, 20),
    ).toBe(true);
    expect(
      shouldShowLeaderLine(detached, detached, false, false, 20),
    ).toBe(false);
  });
});

describe("alignLabels", () => {
  it("aligns left edges while respecting label widths", () => {
    const aligned = alignLabels(labels, "left");

    expect(aligned.a.x - labels[0].width / 2).toBe(10);
    expect(aligned.b.x - labels[1].width / 2).toBe(10);
    expect(aligned.c.x - labels[2].width / 2).toBe(10);
  });

  it("distributes label centers vertically", () => {
    const distributed = alignLabels(labels, "distribute-y");

    expect(distributed.a.y).toBe(20);
    expect(distributed.b.y).toBe(50);
    expect(distributed.c.y).toBe(80);
  });

  it("does not move locked labels", () => {
    const withLock = labels.map((label, index) => ({
      ...label,
      locked: index === 1,
    }));
    const aligned = alignLabels(withLock, "top");

    expect(aligned.b.y).toBe(50);
  });
});

describe("label formatting", () => {
  it("keeps the expected three-line label mode", () => {
    const lines = getLabelLines(
      { id: "A", name: "Segment A", value: 120, percent: 0.4 },
      "name-value-percent",
    );

    expect(lines).toEqual(["Segment A", "120", "(40.0%)"]);
  });

  it("uses a multiline custom label instead of the automatic mode", () => {
    const lines = getLabelLines(
      { id: "A", name: "Segment A", value: 120, percent: 0.4 },
      "name-value-percent",
      "首选路径\n自定义标签",
    );

    expect(lines).toEqual(["首选路径", "自定义标签"]);
  });

  it("reserves more width for Chinese glyphs", () => {
    expect(estimateLabelBox(["样本队列"], 13).width).toBeGreaterThan(
      estimateLabelBox(["Cohort"], 13).width,
    );
  });

  it("reserves extra width for bold italic labels", () => {
    const regular = estimateLabelBox(["Segment A"], 15, 500, "normal");
    const emphasized = estimateLabelBox(["Segment A"], 15, 700, "italic");

    expect(emphasized.width).toBeGreaterThan(regular.width);
  });

  it("never formats a non-zero scientific value as zero", () => {
    expect(formatNumber(0.001, 0)).toBe("0.001");
    expect(
      getLabelLines(
        { id: "tiny", name: "tiny", value: 0.001, percent: 0.00001 },
        "name-value-percent",
        undefined,
        "例",
        0,
      ),
    ).toEqual(["tiny", "0.001 例", "(<0.1%)"]);
  });

  it("keeps the dense example labels separated inside the export-safe area", () => {
    const sample = SAMPLE_DOCUMENTS.find(
      (candidate) => candidate.id === "dense-categories",
    )!.document;
    const layout = buildSankeyLayout(
      sample.rows,
      sample.settings,
      1100,
      720,
    );
    const percentages = buildPercentageSummary(layout.graph, sample.settings);
    const labels = buildLabelPositions(
      layout.graph,
      sample.settings.labelMode,
      sample.settings.labelPlacement,
      sample.settings.fontSize,
      sample.settings.fontWeight,
      sample.settings.fontStyle,
      sample.settings.fontFamily,
      sample.labelOverrides,
      sample.labelTextOverrides,
      percentages.byNode,
      sample.metadata.unit,
      sample.settings.valueDecimals,
    );

    expect(countLabelOverlaps(labels)).toBe(0);
    expect(
      labels
        .filter(
          (label) =>
            !Number.isFinite(label.y) ||
            !Number.isFinite(label.height) ||
            label.y - label.height / 2 < 42 ||
            label.y + label.height / 2 > 678,
        )
        .map((label) => ({ id: label.id, y: label.y, height: label.height })),
    ).toEqual([]);
  });

  it("places default labels outside without automatic leader lines", () => {
    const sample = DEFAULT_DOCUMENT;
    const layout = buildSankeyLayout(
      sample.rows,
      sample.settings,
      1100,
      720,
    );
    const percentages = buildPercentageSummary(layout.graph, sample.settings);
    const positions = buildLabelPositions(
      layout.graph,
      sample.settings.labelMode,
      sample.settings.labelPlacement,
      sample.settings.fontSize,
      sample.settings.fontWeight,
      sample.settings.fontStyle,
      sample.settings.fontFamily,
      sample.labelOverrides,
      sample.labelTextOverrides,
      percentages.byNode,
      sample.metadata.unit,
      sample.settings.valueDecimals,
    );
    const nodeById = new Map(
      (layout.graph?.nodes ?? []).map((node) => [String(node.id), node]),
    );

    expect(sample.settings.labelPlacement).toBe("outside");
    expect(
      positions.every((label) => {
        const node = nodeById.get(label.id)!;
        return label.x < Number(node.x0) || label.x > Number(node.x1);
      }),
    ).toBe(true);
    expect(positions.every((label) => label.leaderLine === false)).toBe(true);
  });

  it("centers labels in inside-preferred mode when the node can hold them", () => {
    const sample = DEFAULT_DOCUMENT;
    const layout = buildSankeyLayout(
      sample.rows,
      sample.settings,
      1100,
      720,
    );
    const percentages = buildPercentageSummary(layout.graph, sample.settings);
    const labels = buildLabelPositions(
      layout.graph,
      sample.settings.labelMode,
      "inside",
      sample.settings.fontSize,
      sample.settings.fontWeight,
      sample.settings.fontStyle,
      sample.settings.fontFamily,
      sample.labelOverrides,
      sample.labelTextOverrides,
      percentages.byNode,
      sample.metadata.unit,
      sample.settings.valueDecimals,
    );
    const nodeById = new Map(
      (layout.graph?.nodes ?? []).map((node) => [String(node.id), node]),
    );

    expect(
      labels.filter((label) => {
        const node = nodeById.get(label.id)!;
        const centerX = (Number(node.x0) + Number(node.x1)) / 2;
        const centerY = (Number(node.y0) + Number(node.y1)) / 2;
        return (
          Math.abs(label.x - centerX) > 0.01 ||
          Math.abs(label.y - centerY) > 0.01
        );
      }),
    ).toEqual([]);
    expect(
      labels.every((label) =>
        getLeaderLineGeometry(nodeById.get(label.id)!, label) === null,
      ),
    ).toBe(true);
  });

  it("moves only labels from short nodes to one aligned outside edge", () => {
    const rows = [
      { id: "1", source: "Total", target: "Large", value: 98 },
      { id: "2", source: "Total", target: "Tiny A", value: 1 },
      { id: "3", source: "Total", target: "Tiny B", value: 1 },
      { id: "4", source: "Large", target: "End", value: 98 },
      { id: "5", source: "Tiny A", target: "End", value: 1 },
      { id: "6", source: "Tiny B", target: "End", value: 1 },
    ];
    const layout = buildSankeyLayout(rows, DEFAULT_SETTINGS, 1100, 720);
    const percentages = buildPercentageSummary(layout.graph, DEFAULT_SETTINGS);
    const positions = buildLabelPositions(
      layout.graph,
      DEFAULT_SETTINGS.labelMode,
      "inside",
      DEFAULT_SETTINGS.fontSize,
      DEFAULT_SETTINGS.fontWeight,
      DEFAULT_SETTINGS.fontStyle,
      DEFAULT_SETTINGS.fontFamily,
      {},
      {},
      percentages.byNode,
      "",
      DEFAULT_SETTINGS.valueDecimals,
    );
    const positionById = new Map(
      positions.map((position) => [position.id, position]),
    );
    const nodeById = new Map(
      (layout.graph?.nodes ?? []).map((node) => [String(node.id), node]),
    );
    const largeNode = nodeById.get("Large")!;
    const largeLabel = positionById.get("Large")!;
    const tinyLabels = [positionById.get("Tiny A")!, positionById.get("Tiny B")!];

    expect(largeLabel.x).toBeCloseTo(
      (Number(largeNode.x0) + Number(largeNode.x1)) / 2,
    );
    expect(largeLabel.leaderLine).toBe(false);
    expect(getLeaderLineGeometry(largeNode, largeLabel)).toBeNull();
    tinyLabels.forEach((label) => {
      const node = nodeById.get(label.id)!;
      expect(label.x - label.width / 2).toBeCloseTo(Number(node.x1) + 12);
      expect(label.leaderLine).toBe(true);
      expect(getLeaderLineGeometry(node, label)).not.toBeNull();
    });
    expect(
      positions.every(
        (label) =>
          label.x - label.width / 2 >= 24 &&
          label.x + label.width / 2 <= 1076,
      ),
    ).toBe(true);
  });
});
