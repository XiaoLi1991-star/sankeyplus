import { describe, expect, it } from "vitest";
import type { SankeyRow } from "../types";
import { analyzeSankeyData } from "./quality";

function rows(values: Array<[string, string, number]>): SankeyRow[] {
  return values.map(([source, target, value], index) => ({
    id: String(index),
    source,
    target,
    value,
  }));
}

describe("analyzeSankeyData", () => {
  it("reports duplicate flows and conservation differences", () => {
    const report = analyzeSankeyData(
      rows([
        ["A", "B", 6],
        ["A", "B", 4],
        ["B", "C", 8],
      ]),
    );

    expect(report.warningCount).toBe(2);
    expect(report.issues.some((issue) => issue.id.startsWith("duplicate"))).toBe(
      true,
    );
    expect(report.issues.some((issue) => issue.id === "balance-B")).toBe(true);
  });

  it("blocks cycles and self-links", () => {
    const report = analyzeSankeyData(
      rows([
        ["A", "A", 1],
        ["A", "B", 1],
        ["B", "A", 1],
      ]),
    );

    expect(report.errorCount).toBeGreaterThanOrEqual(2);
    expect(report.issues.some((issue) => issue.id === "cycle")).toBe(true);
  });

  it("returns a clean informational result for balanced data", () => {
    const report = analyzeSankeyData(
      rows([
        ["A", "B", 10],
        ["B", "C", 10],
      ]),
    );

    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.infoCount).toBe(1);
  });

  it("warns when the same node is assigned to conflicting groups", () => {
    const report = analyzeSankeyData([
      {
        id: "1",
        source: "A",
        target: "B",
        targetGroup: "分组一",
        value: 4,
      },
      {
        id: "2",
        source: "C",
        target: "B",
        targetGroup: "分组二",
        value: 3,
      },
    ]);

    expect(report.issues.some((issue) => issue.id === "group-conflict-B")).toBe(
      true,
    );
  });
});
