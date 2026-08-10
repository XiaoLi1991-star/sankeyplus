import type { NodeColorMode } from "../types";
import type { LayoutGraph, LayoutLink, LayoutNode } from "./sankey";
import { getNodeId } from "./sankey";

export const DEFAULT_NODE_COLOR = "#64748B";
export const UNGROUPED_NODE_COLOR = "#94A3B8";

function nodeColorKey(node: LayoutNode, mode: NodeColorMode): string | null {
  if (mode === "single") return null;
  if (mode === "stage") return `stage:${Number(node.depth ?? 0)}`;
  if (mode === "group") {
    const group = node.group?.trim();
    return group ? `group:${group}` : null;
  }
  return `node:${getNodeId(node)}`;
}

function categoryColorMap(keys: Array<string | null>, palette: string[]) {
  const safePalette = palette.length > 0 ? palette : [DEFAULT_NODE_COLOR];
  const categories = [...new Set(keys.filter((key): key is string => Boolean(key)))].sort(
    (a, b) => a.localeCompare(b, "zh-CN"),
  );
  return new Map(
    categories.map((key, index) => [key, safePalette[index % safePalette.length]]),
  );
}

/**
 * Node groups and link groups share one registry. A group name therefore keeps
 * the same color across nodes and ribbons even when the two surfaces contain
 * different subsets of groups.
 */
export function resolveSharedGroupColors(
  graph: LayoutGraph | null,
  palette: string[],
): Map<string, string> {
  return categoryColorMap(
    [
      ...(graph?.nodes ?? []).map((node) => node.group?.trim() || null),
      ...(graph?.links ?? []).map((link) => link.group?.trim() || null),
    ],
    palette,
  );
}

export function resolveNodeColors(
  graph: LayoutGraph | null,
  palette: string[],
  overrides: Record<string, string>,
  mode: NodeColorMode,
  baseColor = DEFAULT_NODE_COLOR,
): Map<string, string> {
  const nodes = graph?.nodes ?? [];
  const colorByCategory =
    mode === "group"
      ? resolveSharedGroupColors(graph, palette)
      : categoryColorMap(
          nodes.map((node) => nodeColorKey(node, mode)),
          palette,
        );
  return new Map(
    nodes.map((node) => {
      const id = getNodeId(node);
      const key = nodeColorKey(node, mode);
      const mappedColor =
        mode === "single"
          ? baseColor
          : mode === "group"
            ? node.group?.trim()
              ? colorByCategory.get(node.group.trim()) ?? UNGROUPED_NODE_COLOR
              : UNGROUPED_NODE_COLOR
            : key
              ? colorByCategory.get(key) ?? UNGROUPED_NODE_COLOR
              : UNGROUPED_NODE_COLOR;
      return [
        id,
        overrides[id] ?? mappedColor,
      ];
    }),
  );
}

export function resolveLinkGroupColors(
  graph: LayoutGraph | null,
  palette: string[],
): Map<string, string> {
  return resolveSharedGroupColors(graph, palette);
}

export interface ColorMappingSummary {
  categoryCount: number;
  paletteCapacity: number;
  missingGroupCount: number;
  repeatsColors: boolean;
}

export function summarizeNodeColorMapping(
  graph: LayoutGraph | null,
  mode: NodeColorMode,
  paletteCapacity: number,
): ColorMappingSummary {
  const nodes = graph?.nodes ?? [];
  const keys = nodes.map((node) => nodeColorKey(node, mode));
  const categoryCount =
    mode === "single"
      ? nodes.length > 0
        ? 1
        : 0
      : new Set(keys.filter(Boolean)).size;
  const missingGroupCount =
    mode === "group" ? keys.filter((key) => key === null).length : 0;
  return {
    categoryCount,
    paletteCapacity,
    missingGroupCount,
    repeatsColors: categoryCount > paletteCapacity,
  };
}

export function summarizeLinkGroupColorMapping(
  graph: LayoutGraph | null,
  paletteCapacity: number,
): ColorMappingSummary {
  const groups = (graph?.links ?? []).map((link) => link.group?.trim() || null);
  const categoryCount = new Set(groups.filter(Boolean)).size;
  return {
    categoryCount,
    paletteCapacity,
    missingGroupCount: groups.filter((group) => group === null).length,
    repeatsColors: categoryCount > paletteCapacity,
  };
}

export function linkGroupColor(
  link: LayoutLink,
  colors: Map<string, string>,
): string {
  const key = link.group?.trim();
  return key ? colors.get(key) ?? UNGROUPED_NODE_COLOR : UNGROUPED_NODE_COLOR;
}
