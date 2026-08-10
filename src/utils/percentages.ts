import type { PercentageBasis, SankeySettings } from "../types";
import type { LayoutGraph, LayoutNode } from "./sankey";
import { getNodeId } from "./sankey";

export interface PercentageSummary {
  byNode: Record<string, number>;
  basis: PercentageBasis;
  denominatorLabel: string;
  cohortTotal: number;
}

function nodeValue(node: LayoutNode): number {
  return Math.max(0, Number(node.value ?? 0));
}

export function buildPercentageSummary(
  graph: LayoutGraph | null,
  settings: Pick<SankeySettings, "percentageBasis" | "customDenominator">,
): PercentageSummary {
  if (!graph || graph.nodes.length === 0) {
    return {
      byNode: {},
      basis: settings.percentageBasis,
      denominatorLabel: "暂无可用分母",
      cohortTotal: 0,
    };
  }

  const roots = graph.nodes.filter((node) => (node.targetLinks?.length ?? 0) === 0);
  const cohortTotal = graph.nodes
    .filter((node) => roots.includes(node))
    .reduce((sum, node) => sum + nodeValue(node), 0);

  const columnTotals = new Map<number, number>();
  const visualColumn = (node: LayoutNode) =>
    Math.round((((node.x0 ?? 0) + (node.x1 ?? 0)) / 2) * 10) / 10;
  graph.nodes.forEach((node) => {
    const column = visualColumn(node);
    columnTotals.set(column, (columnTotals.get(column) ?? 0) + nodeValue(node));
  });

  const byNode = Object.fromEntries(
    graph.nodes.map((node) => {
      const denominator =
        settings.percentageBasis === "column"
          ? (columnTotals.get(visualColumn(node)) ?? 0)
          : settings.percentageBasis === "custom"
            ? settings.customDenominator
            : cohortTotal;
      return [
        getNodeId(node),
        denominator > 0 ? nodeValue(node) / denominator : 0,
      ];
    }),
  );

  const denominatorLabel =
    settings.percentageBasis === "column"
      ? "百分比：各可视列总量为分母"
      : settings.percentageBasis === "custom"
        ? `百分比：自定义分母 ${settings.customDenominator.toLocaleString("zh-CN")}`
        : `百分比：所有起始节点总量 ${cohortTotal.toLocaleString("zh-CN")} 为分母`;

  return {
    byNode,
    basis: settings.percentageBasis,
    denominatorLabel,
    cohortTotal,
  };
}
