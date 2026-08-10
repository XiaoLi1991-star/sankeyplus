import type { SankeyRow } from "../types";

export type QualitySeverity = "error" | "warning" | "info";

export interface QualityIssue {
  id: string;
  severity: QualitySeverity;
  title: string;
  detail: string;
  rowIds?: string[];
  nodeId?: string;
}

export interface QualityReport {
  issues: QualityIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

function hasCycle(rows: SankeyRow[]): boolean {
  const edges = new Map<string, string[]>();
  rows.forEach((row) => {
    edges.set(row.source, [...(edges.get(row.source) ?? []), row.target]);
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const target of edges.get(node) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...edges.keys()].some(visit);
}

export function analyzeSankeyData(rows: SankeyRow[]): QualityReport {
  const issues: QualityIssue[] = [];
  const validRows = rows.filter(
    (row) =>
      row.source.trim() &&
      row.target.trim() &&
      Number.isFinite(row.value) &&
      row.value > 0,
  );

  rows.forEach((row, index) => {
    if (!row.source.trim() || !row.target.trim()) {
      issues.push({
        id: `missing-${row.id}`,
        severity: "error",
        title: `第 ${index + 1} 行缺少节点名称`,
        detail: "来源和目标都必须填写。",
        rowIds: [row.id],
      });
    }
    if (!Number.isFinite(row.value) || row.value <= 0) {
      issues.push({
        id: `value-${row.id}`,
        severity: "error",
        title: `第 ${index + 1} 行数值无效`,
        detail: "流量必须是大于 0 的有限数字。",
        rowIds: [row.id],
      });
    }
    if (row.source.trim() && row.source.trim() === row.target.trim()) {
      issues.push({
        id: `self-${row.id}`,
        severity: "error",
        title: `自连接：${row.source.trim()}`,
        detail: "桑基图不支持节点流向自身，请删除或拆分该记录。",
        rowIds: [row.id],
      });
    }
    if (row.source !== row.source.trim() || row.target !== row.target.trim()) {
      issues.push({
        id: `space-${row.id}`,
        severity: "warning",
        title: `第 ${index + 1} 行包含首尾空格`,
        detail: "空格可能把同一个节点拆成两个类别。",
        rowIds: [row.id],
      });
    }
  });

  const duplicates = new Map<string, SankeyRow[]>();
  validRows.forEach((row) => {
    const key = `${row.source.trim()}\u0000${row.target.trim()}`;
    duplicates.set(key, [...(duplicates.get(key) ?? []), row]);
  });
  duplicates.forEach((group) => {
    if (group.length < 2) return;
    issues.push({
      id: `duplicate-${group[0].source}-${group[0].target}`,
      severity: "warning",
      title: `重复流向：${group[0].source} → ${group[0].target}`,
      detail: `${group.length} 行会作为独立流带绘制；若代表同一类别，建议先求和合并。`,
      rowIds: group.map((row) => row.id),
    });
  });

  const nodeGroupAssignments = new Map<string, Map<string, string[]>>();
  const recordNodeGroup = (node: string, group: string | undefined, rowId: string) => {
    const normalized = group?.trim();
    if (!normalized) return;
    const assignments = nodeGroupAssignments.get(node) ?? new Map<string, string[]>();
    assignments.set(normalized, [...(assignments.get(normalized) ?? []), rowId]);
    nodeGroupAssignments.set(node, assignments);
  };
  validRows.forEach((row) => {
    recordNodeGroup(row.source.trim(), row.sourceGroup, row.id);
    recordNodeGroup(row.target.trim(), row.targetGroup, row.id);
  });
  nodeGroupAssignments.forEach((assignments, node) => {
    if (assignments.size < 2) return;
    issues.push({
      id: `group-conflict-${node}`,
      severity: "warning",
      title: `节点分组冲突：${node}`,
      detail: `同一节点被分配到 ${[...assignments.keys()].join("、")}；绘图将采用首次出现的非空分组。`,
      rowIds: [...assignments.values()].flat(),
      nodeId: node,
    });
  });

  if (hasCycle(validRows)) {
    issues.push({
      id: "cycle",
      severity: "error",
      title: "检测到循环流",
      detail: "当前布局不支持闭环，请移除形成循环的流向。",
    });
  }

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  validRows.forEach((row) => {
    incoming.set(row.target, (incoming.get(row.target) ?? 0) + row.value);
    outgoing.set(row.source, (outgoing.get(row.source) ?? 0) + row.value);
  });
  const nodes = new Set([...incoming.keys(), ...outgoing.keys()]);
  nodes.forEach((node) => {
    const input = incoming.get(node) ?? 0;
    const output = outgoing.get(node) ?? 0;
    if (input === 0 || output === 0) return;
    const difference = output - input;
    const tolerance = Math.max(input, output) * 1e-6;
    if (Math.abs(difference) <= tolerance) return;
    issues.push({
      id: `balance-${node}`,
      severity: "warning",
      title: `流量不守恒：${node}`,
      detail: `流入 ${input.toLocaleString("zh-CN")}，流出 ${output.toLocaleString("zh-CN")}，相差 ${Math.abs(difference).toLocaleString("zh-CN")}。请确认是否为损耗、过滤、合并或统计口径差异。`,
      nodeId: node,
    });
  });

  if (validRows.length > 1) {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = 0;
    validRows.forEach((row) => {
      minimum = Math.min(minimum, row.value);
      maximum = Math.max(maximum, row.value);
    });
    const ratio = maximum / minimum;
    if (ratio >= 1000) {
      issues.push({
        id: "dynamic-range",
        severity: "warning",
        title: "流量数量级差异很大",
        detail: `最大值约为最小值的 ${ratio.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} 倍；极细流带可能在缩印或印刷后不可见，请考虑拆图或在图注中说明。`,
      });
    }
  }

  if (issues.length === 0 && rows.length > 0) {
    issues.push({
      id: "clean",
      severity: "info",
      title: "基础数据检查通过",
      detail: "未发现无效值、重复流向、循环或中间节点流量不守恒。",
    });
  }

  return {
    issues,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    infoCount: issues.filter((issue) => issue.severity === "info").length,
  };
}
