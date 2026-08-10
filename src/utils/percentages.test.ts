import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../data/sampleData";
import type { SankeyRow } from "../types";
import { buildPercentageSummary } from "./percentages";
import { buildSankeyLayout } from "./sankey";

const rows: SankeyRow[] = [
  { id: "1", source: "A", target: "B", value: 6 },
  { id: "2", source: "A", target: "C", value: 4 },
  { id: "3", source: "B", target: "D", value: 5 },
  { id: "4", source: "C", target: "D", value: 3 },
];

describe("buildPercentageSummary", () => {
  const graph = buildSankeyLayout(rows, DEFAULT_SETTINGS, 1100, 720).graph;

  it("uses the first column total as the cohort denominator", () => {
    const summary = buildPercentageSummary(graph, {
      percentageBasis: "cohort",
      customDenominator: 1,
    });

    expect(summary.cohortTotal).toBe(10);
    expect(summary.byNode.A).toBe(1);
    expect(summary.byNode.D).toBe(0.8);
  });

  it("supports column and custom denominators", () => {
    const column = buildPercentageSummary(graph, {
      percentageBasis: "column",
      customDenominator: 1,
    });
    const custom = buildPercentageSummary(graph, {
      percentageBasis: "custom",
      customDenominator: 20,
    });

    expect(column.byNode.D).toBe(1);
    expect(custom.byNode.A).toBe(0.5);
  });

  it("uses rendered columns after right alignment", () => {
    const alignedRows: SankeyRow[] = [
      { id: "1", source: "A", target: "B", value: 100 },
      { id: "2", source: "B", target: "C", value: 100 },
      { id: "3", source: "X", target: "C", value: 50 },
    ];
    const alignedGraph = buildSankeyLayout(
      alignedRows,
      { ...DEFAULT_SETTINGS, alignment: "right" },
      1100,
      720,
    ).graph;
    const summary = buildPercentageSummary(alignedGraph, {
      percentageBasis: "column",
      customDenominator: 1,
    });

    expect(summary.byNode.B).toBeCloseTo(2 / 3);
    expect(summary.byNode.X).toBeCloseTo(1 / 3);
    expect(summary.byNode.B + summary.byNode.X).toBeCloseTo(1);
  });
});
