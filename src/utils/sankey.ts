import {
  sankey,
  sankeyCenter,
  sankeyJustify,
  sankeyLeft,
  sankeyRight,
  type SankeyGraph,
  type SankeyLink,
  type SankeyNode,
} from "d3-sankey";
import type {
  NodeOverride,
  SankeyAlignment,
  SankeyRow,
  SankeySettings,
} from "../types";

export interface FlowNode {
  id: string;
  order: number;
  group?: string;
}

export interface FlowLink {
  id: string;
  source: string;
  target: string;
  value: number;
  group?: string;
}

export type LayoutNode = SankeyNode<FlowNode, FlowLink>;
export type LayoutLink = SankeyLink<FlowNode, FlowLink>;
export type LayoutGraph = SankeyGraph<FlowNode, FlowLink>;

const aligners = {
  justify: sankeyJustify,
  left: sankeyLeft,
  right: sankeyRight,
  center: sankeyCenter,
} satisfies Record<SankeyAlignment, typeof sankeyJustify>;

export interface LayoutResult {
  graph: LayoutGraph | null;
  error: string | null;
}

export interface SankeyColumn {
  index: number;
  x: number;
  nodeIds: string[];
}

export const SANKEY_EXTENT_TOP = 72;
export const SANKEY_EXTENT_BOTTOM = 86;
export const SANKEY_EXTENT_LEFT = 120;
export const SANKEY_EXTENT_RIGHT = 120;

function nodeHeight(node: LayoutNode): number {
  return Math.max(0, Number(node.y1 ?? 0) - Number(node.y0 ?? 0));
}

function nodeColumnCenter(node: LayoutNode): number {
  return (Number(node.x0 ?? 0) + Number(node.x1 ?? 0)) / 2;
}

function nodesInColumn(graph: LayoutGraph, target: LayoutNode): LayoutNode[] {
  const center = nodeColumnCenter(target);
  return graph.nodes
    .filter((node) => Math.abs(nodeColumnCenter(node) - center) < 0.5)
    .sort(
      (a, b) =>
        Number(a.y0 ?? 0) - Number(b.y0 ?? 0) ||
        (a as FlowNode).order - (b as FlowNode).order,
    );
}

function clampNodeY(y: number, node: LayoutNode, height: number): number {
  const maxY = height - SANKEY_EXTENT_BOTTOM - nodeHeight(node);
  return Math.min(
    Math.max(y, SANKEY_EXTENT_TOP),
    Math.max(SANKEY_EXTENT_TOP, maxY),
  );
}

function effectiveColumnGap(
  nodes: LayoutNode[],
  height: number,
  requestedPadding: number,
): number {
  if (nodes.length < 2) return 0;
  const availableHeight =
    height - SANKEY_EXTENT_TOP - SANKEY_EXTENT_BOTTOM;
  const occupiedHeight = nodes.reduce(
    (sum, node) => sum + nodeHeight(node),
    0,
  );
  return Math.min(
    Math.max(0, requestedPadding),
    Math.max(0, (availableHeight - occupiedHeight) / (nodes.length - 1)),
  );
}

function removeColumnOverlaps(
  nodes: LayoutNode[],
  height: number,
  nodePadding: number,
): void {
  if (nodes.length < 2) return;
  const bottom = height - SANKEY_EXTENT_BOTTOM;
  const gap = effectiveColumnGap(nodes, height, nodePadding);
  const ordered = [...nodes].sort(
    (a, b) =>
      Number(a.y0 ?? 0) - Number(b.y0 ?? 0) ||
      (a as FlowNode).order - (b as FlowNode).order,
  );

  let cursor = SANKEY_EXTENT_TOP;
  ordered.forEach((node) => {
    const heightOfNode = nodeHeight(node);
    const nextY = Math.max(Number(node.y0 ?? cursor), cursor);
    node.y0 = nextY;
    node.y1 = nextY + heightOfNode;
    cursor = node.y1 + gap;
  });

  cursor = bottom;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const node = ordered[index];
    const heightOfNode = nodeHeight(node);
    const nextY = Math.min(Number(node.y0 ?? 0), cursor - heightOfNode);
    node.y0 = nextY;
    node.y1 = nextY + heightOfNode;
    cursor = nextY - gap;
  }
}

/**
 * Resolve a direct node drag into stable, non-overlapping positions for its
 * complete Sankey column. Crossing a neighbour's midpoint reorders the nodes;
 * otherwise the dragged node stays inside the free interval around its slot.
 */
export function resolveNodeDragPositions(
  graph: LayoutGraph,
  nodeId: string,
  requestedY: number,
  height: number,
  nodePadding: number,
): Record<string, NodeOverride> {
  const target = graph.nodes.find((node) => getNodeId(node) === nodeId);
  if (!target || target.y0 === undefined || target.y1 === undefined) return {};

  const ordered = nodesInColumn(graph, target);
  const originalIndex = ordered.indexOf(target);
  if (originalIndex < 0) return {};

  const targetHeight = nodeHeight(target);
  const boundedY = clampNodeY(requestedY, target, height);
  let targetIndex = originalIndex;

  if (boundedY > target.y0) {
    while (targetIndex < ordered.length - 1) {
      const neighbour = ordered[targetIndex + 1];
      const neighbourCenter =
        (Number(neighbour.y0 ?? 0) + Number(neighbour.y1 ?? 0)) / 2;
      if (boundedY + targetHeight <= neighbourCenter) break;
      targetIndex += 1;
    }
  } else if (boundedY < target.y0) {
    while (targetIndex > 0) {
      const neighbour = ordered[targetIndex - 1];
      const neighbourCenter =
        (Number(neighbour.y0 ?? 0) + Number(neighbour.y1 ?? 0)) / 2;
      if (boundedY >= neighbourCenter) break;
      targetIndex -= 1;
    }
  }

  const withoutTarget = ordered.filter((node) => node !== target);
  withoutTarget.splice(targetIndex, 0, target);
  const before = withoutTarget.slice(0, targetIndex);
  const after = withoutTarget.slice(targetIndex + 1);
  const gap = effectiveColumnGap(withoutTarget, height, nodePadding);
  const top = SANKEY_EXTENT_TOP;
  const bottom = height - SANKEY_EXTENT_BOTTOM;
  const beforeHeight = before.reduce((sum, node) => sum + nodeHeight(node), 0);
  const afterHeight = after.reduce((sum, node) => sum + nodeHeight(node), 0);
  const minTargetY = top + beforeHeight + before.length * gap;
  const maxTargetY =
    bottom - targetHeight - afterHeight - after.length * gap;
  const targetY = Math.min(
    Math.max(boundedY, minTargetY),
    Math.max(minTargetY, maxTargetY),
  );
  const positions: Record<string, NodeOverride> = {
    [nodeId]: { y: targetY },
  };

  let cursor = targetY - gap;
  for (let index = before.length - 1; index >= 0; index -= 1) {
    const node = before[index];
    const nextY = Math.min(
      Number(node.y0 ?? 0),
      cursor - nodeHeight(node),
    );
    positions[getNodeId(node)] = { y: nextY };
    cursor = nextY - gap;
  }

  cursor = targetY + targetHeight + gap;
  after.forEach((node) => {
    const nextY = Math.max(Number(node.y0 ?? 0), cursor);
    positions[getNodeId(node)] = { y: nextY };
    cursor = nextY + nodeHeight(node) + gap;
  });

  if (cursor - gap > bottom) {
    cursor = bottom;
    for (let index = after.length - 1; index >= 0; index -= 1) {
      const node = after[index];
      const nextY = Math.min(
        positions[getNodeId(node)].y,
        cursor - nodeHeight(node),
      );
      positions[getNodeId(node)] = { y: nextY };
      cursor = nextY - gap;
    }
  }

  return positions;
}

export function resolveNodeKeyboardPositions(
  graph: LayoutGraph,
  nodeId: string,
  deltaY: number,
  height: number,
  nodePadding: number,
): Record<string, NodeOverride> {
  const target = graph.nodes.find((node) => getNodeId(node) === nodeId);
  if (!target || target.y0 === undefined || target.y1 === undefined) return {};

  let positions = resolveNodeDragPositions(
    graph,
    nodeId,
    target.y0 + deltaY,
    height,
    nodePadding,
  );
  if (
    positions[nodeId] &&
    Math.abs(positions[nodeId].y - target.y0) >= 0.5
  ) {
    return positions;
  }

  const ordered = nodesInColumn(graph, target);
  const index = ordered.indexOf(target);
  const neighbour = deltaY > 0 ? ordered[index + 1] : ordered[index - 1];
  if (!neighbour) return positions;
  const neighbourCenter =
    (Number(neighbour.y0 ?? 0) + Number(neighbour.y1 ?? 0)) / 2;
  const swapY =
    deltaY > 0
      ? neighbourCenter - nodeHeight(target) + 0.5
      : neighbourCenter - 0.5;
  positions = resolveNodeDragPositions(
    graph,
    nodeId,
    swapY,
    height,
    nodePadding,
  );
  return positions;
}

export function buildSankeyLayout(
  rows: SankeyRow[],
  settings: SankeySettings,
  width: number,
  height: number,
): LayoutResult {
  if (rows.length === 0) {
    return { graph: null, error: "至少需要一条有效流向数据。" };
  }

  const nodeIds: string[] = [];
  const seen = new Set<string>();
  const nodeGroups = new Map<string, string>();
  rows.forEach((row) => {
    if (row.sourceGroup?.trim() && !nodeGroups.has(row.source)) {
      nodeGroups.set(row.source, row.sourceGroup.trim());
    }
    if (row.targetGroup?.trim() && !nodeGroups.has(row.target)) {
      nodeGroups.set(row.target, row.targetGroup.trim());
    }
    [row.source, row.target].forEach((id) => {
      if (!seen.has(id)) {
        seen.add(id);
        nodeIds.push(id);
      }
    });
  });

  const nodes: FlowNode[] = nodeIds.map((id, order) => ({
    id,
    order,
    group: nodeGroups.get(id),
  }));
  const links: FlowLink[] = rows.map((row) => ({
    id: row.id,
    source: row.source,
    target: row.target,
    value: row.value,
    group: row.linkGroup?.trim() || undefined,
  }));

  try {
    const generator = sankey<FlowNode, FlowLink>()
      .nodeId((node) => node.id)
      .nodeWidth(settings.nodeWidth)
      .nodePadding(settings.nodePadding)
      .nodeAlign(aligners[settings.alignment])
      .extent([
        [SANKEY_EXTENT_LEFT, SANKEY_EXTENT_TOP],
        [width - SANKEY_EXTENT_RIGHT, height - SANKEY_EXTENT_BOTTOM],
      ])
      .iterations(24);

    return {
      graph: generator({
        nodes: nodes.map((node) => ({ ...node })),
        links: links.map((link) => ({ ...link })),
      }),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isCycle = /circular link/i.test(message);
    return {
      graph: null,
      error: isCycle
        ? "当前版本暂不支持循环流，请先移除形成闭环的流向。"
        : `无法计算桑基布局：${message}`,
    };
  }
}

export function applyNodePositions(
  graph: LayoutGraph,
  positions: Record<string, NodeOverride>,
  height: number,
  nodePadding: number,
): LayoutGraph {
  if (Object.keys(positions).length === 0) return graph;

  graph.nodes.forEach((node) => {
    const position = positions[getNodeId(node)];
    if (!position || node.y0 === undefined || node.y1 === undefined) return;

    const heightOfNode = nodeHeight(node);
    const nextY = clampNodeY(position.y, node, height);
    node.y0 = nextY;
    node.y1 = nextY + heightOfNode;
  });

  const visitedColumns = new Set<number>();
  graph.nodes.forEach((node) => {
    const center = nodeColumnCenter(node);
    const columnKey = Math.round(center * 2);
    if (visitedColumns.has(columnKey)) return;
    visitedColumns.add(columnKey);
    removeColumnOverlaps(nodesInColumn(graph, node), height, nodePadding);
  });

  sankey<FlowNode, FlowLink>().update(graph);
  return graph;
}

export function getNodeId(node: LayoutNode): string {
  return String((node as FlowNode).id);
}

export function getSankeyColumns(
  graph: LayoutGraph | null,
): SankeyColumn[] {
  if (!graph) return [];

  const groups = new Map<number, LayoutNode[]>();
  graph.nodes.forEach((node) => {
    const key = Math.round(nodeColumnCenter(node) * 2);
    groups.set(key, [...(groups.get(key) ?? []), node]);
  });

  return [...groups.values()]
    .sort((a, b) => nodeColumnCenter(a[0]) - nodeColumnCenter(b[0]))
    .map((nodes, index) => ({
      index,
      x: nodeColumnCenter(nodes[0]),
      nodeIds: [...nodes]
        .sort(
          (a, b) =>
            Number(a.y0 ?? 0) - Number(b.y0 ?? 0) ||
            (a as FlowNode).order - (b as FlowNode).order,
        )
        .map(getNodeId),
    }));
}

export function sankeyAlignmentsHaveVisibleEffect(
  graph: LayoutGraph | null,
): boolean {
  if (!graph || graph.nodes.length === 0) return false;
  const columnCount =
    Math.max(...graph.nodes.map((node) => Number(node.depth ?? 0))) + 1;
  const signatures = Object.values(aligners).map((align) =>
    graph.nodes
      .map((node) => Math.floor(align(node, columnCount)))
      .join(","),
  );
  return new Set(signatures).size > 1;
}

export function getLinkId(link: LayoutLink): string {
  return String((link as FlowLink).id);
}
