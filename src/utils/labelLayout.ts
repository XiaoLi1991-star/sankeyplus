import type {
  AlignOperation,
  LabelFontFamily,
  LabelMode,
  LabelPlacement,
  LabelPosition,
  LabelOverride,
} from "../types";
import { getLabelFontStack } from "../data/fonts";
import type { LayoutGraph, LayoutNode } from "./sankey";
import { getNodeId } from "./sankey";
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "./publication";

export interface LabelValue {
  id: string;
  name: string;
  value: number;
  percent: number;
}

export interface LeaderLineGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function formatNumber(value: number, decimals = 1): string {
  const formatted = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
  if (value === 0 || Number(formatted.replace(/,/g, "")) !== 0) return formatted;
  const precise = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(value);
  return Number(precise.replace(/,/g, "")) !== 0
    ? precise
    : value.toExponential(2);
}

export function getLabelLines(
  node: LabelValue,
  mode: LabelMode,
  customText?: string,
  unit = "",
  valueDecimals = 1,
): string[] {
  const customLines = customText
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (customLines?.length) return customLines;

  const formattedValue = formatNumber(node.value, valueDecimals);
  const value = unit.trim() ? `${formattedValue} ${unit.trim()}` : formattedValue;
  const percentValue = node.percent * 100;
  const percent =
    percentValue > 0 && percentValue < 0.05
      ? "<0.1%"
      : `${percentValue.toFixed(1)}%`;

  switch (mode) {
    case "name":
      return [node.name];
    case "name-value":
      return [node.name, value];
    case "name-percent":
      return [node.name, percent];
    case "name-value-percent":
      return [node.name, value, `(${percent})`];
  }
}

function characterUnits(text: string): number {
  return Array.from(text).reduce((total, character) => {
    return total + (/[\u3000-\u9fff]/.test(character) ? 1 : 0.62);
  }, 0);
}

export function estimateLabelBox(
  lines: string[],
  fontSize: number,
  fontWeight: 500 | 700 = 500,
  fontStyle: "normal" | "italic" = "normal",
): { width: number; height: number } {
  const longest = Math.max(...lines.map(characterUnits), 1);
  const weightScale = fontWeight === 700 ? 1.06 : 1;
  const styleScale = fontStyle === "italic" ? 1.03 : 1;
  return {
    width: Math.max(
      42,
      longest * fontSize * weightScale * styleScale + 16,
    ),
    // Labels no longer have a padded white background. Keep only a small
    // interaction allowance around the actual line box so dense columns can
    // be arranged without manufacturing false collisions.
    height: lines.length * fontSize * 1.18 + 4,
  };
}

let measurementCanvas: HTMLCanvasElement | null = null;

export function measureLabelBox(
  lines: string[],
  fontSize: number,
  fontWeight: 500 | 700,
  fontStyle: "normal" | "italic",
  fontFamily: LabelFontFamily,
): { width: number; height: number } {
  if (typeof document === "undefined") {
    return estimateLabelBox(lines, fontSize, fontWeight, fontStyle);
  }
  measurementCanvas ??= document.createElement("canvas");
  const context = measurementCanvas.getContext("2d");
  if (!context) return estimateLabelBox(lines, fontSize, fontWeight, fontStyle);
  context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${getLabelFontStack(fontFamily)}`;
  const width = Math.max(
    42,
    ...lines.map((line) => context.measureText(line).width + 16),
  );
  return {
    width,
    height: lines.length * fontSize * 1.18 + 4,
  };
}

export function buildLabelPositions(
  graph: LayoutGraph | null,
  mode: LabelMode,
  placement: LabelPlacement,
  fontSize: number,
  fontWeight: 500 | 700,
  fontStyle: "normal" | "italic",
  fontFamily: LabelFontFamily,
  overrides: Record<string, LabelOverride>,
  textOverrides: Record<string, string>,
  percentages: Record<string, number>,
  unit: string,
  valueDecimals: number,
  canvasWidth = ARTBOARD_WIDTH,
  canvasHeight = ARTBOARD_HEIGHT,
): LabelPosition[] {
  if (!graph) return [];

  const leftmostNodeX = Math.min(
    ...graph.nodes.map((node) => Number(node.x0 ?? 0)),
  );
  const rightmostNodeX = Math.max(
    ...graph.nodes.map((node) => Number(node.x1 ?? 0)),
  );
  const safeHorizontalInset = 24;

  const positions = graph.nodes.map((node: LayoutNode) => {
    const id = getNodeId(node);
    const value = Number(node.value ?? 0);
    const lines = getLabelLines(
      {
        id,
        name: id,
        value,
        percent: percentages[id] ?? 0,
      },
      mode,
      textOverrides[id],
      unit,
      valueDecimals,
    );
    const box = measureLabelBox(
      lines,
      fontSize,
      fontWeight,
      fontStyle,
      fontFamily,
    );
    const override = overrides[id];
    const centerX = ((node.x0 ?? 0) + (node.x1 ?? 0)) / 2;
    const centerY = ((node.y0 ?? 0) + (node.y1 ?? 0)) / 2;
    const nodeWidth = Number(node.x1 ?? 0) - Number(node.x0 ?? 0);
    const nodeHeight = Number(node.y1 ?? 0) - Number(node.y0 ?? 0);
    // Sankey nodes are intentionally narrow. A centered label may extend
    // beyond the bar horizontally, but the bar still needs enough visual
    // width to act as an anchor and enough height for the complete line box.
    const minimumAnchorWidth = Math.min(
      box.width,
      Math.max(18, fontSize * 1.25),
    );
    const fitsCentered =
      nodeWidth >= minimumAnchorWidth &&
      nodeHeight >= box.height + Math.max(6, fontSize * 0.35);
    const useCenteredPosition = placement === "inside" && fitsCentered;
    const isLeftmost = Math.abs(Number(node.x0 ?? 0) - leftmostNodeX) < 1;
    const isRightmost = Math.abs(Number(node.x1 ?? 0) - rightmostNodeX) < 1;
    const placeOnRight =
      isRightmost || (!isLeftmost && centerX >= canvasWidth / 2);
    const preferredX = placeOnRight
      ? Number(node.x1 ?? centerX) + box.width / 2 + 12
      : Number(node.x0 ?? centerX) - box.width / 2 - 12;
    const detachedX = Math.min(
      canvasWidth - safeHorizontalInset - box.width / 2,
      Math.max(safeHorizontalInset + box.width / 2, preferredX),
    );
    return {
      id,
      x: override?.x ?? (useCenteredPosition ? centerX : detachedX),
      y: override?.y ?? centerY,
      width: box.width,
      height: box.height,
      locked: override?.locked ?? false,
      leaderLine: placement === "inside" && !fitsCentered,
    };
  });

  const layerById = new Map(
    graph.nodes.map((node) => [getNodeId(node), Math.round(node.x0 ?? 0)]),
  );
  const nodeById = new Map(
    graph.nodes.map((node) => [getNodeId(node), node]),
  );
  const groups = new Map<number, LabelPosition[]>();
  positions.forEach((position) => {
    if (overrides[position.id]) return;
    const node = nodeById.get(position.id);
    if (!node) return;
    const centerX = (Number(node.x0 ?? 0) + Number(node.x1 ?? 0)) / 2;
    const centerY = (Number(node.y0 ?? 0) + Number(node.y1 ?? 0)) / 2;
    // Centered labels stay attached to their own nodes. Only labels that had
    // to leave a short/thin node participate in the outside-column packing.
    if (
      Math.abs(position.x - centerX) < 0.5 &&
      Math.abs(position.y - centerY) < 0.5
    ) {
      return;
    }
    const layer = layerById.get(position.id) ?? 0;
    groups.set(layer, [...(groups.get(layer) ?? []), position]);
  });

  groups.forEach((group) => {
    if (group.length < 2) return;
    const ordered = [...group].sort((a, b) => a.y - b.y);
    const topLimit = 42;
    const bottomLimit = canvasHeight - 42;
    const totalLabelHeight = ordered.reduce(
      (total, item) => total + item.height,
      0,
    );
    const availableGap =
      (bottomLimit - topLimit - totalLabelHeight) / (ordered.length - 1);
    const gap = Math.max(2, Math.min(7, availableGap));
    let cursor = topLimit;

    ordered.forEach((item) => {
      const top = Math.max(item.y - item.height / 2, cursor);
      item.y = top + item.height / 2;
      cursor = top + item.height + gap;
    });

    const overflow = cursor - gap - bottomLimit;
    if (overflow > 0) {
      ordered.forEach((item) => {
        item.y -= overflow;
      });
    }

    const underflow = topLimit - (ordered[0].y - ordered[0].height / 2);
    if (underflow > 0) {
      ordered.forEach((item) => {
        item.y += underflow;
      });
    }

    // A large original gap near the top can survive the forward pass and push
    // the final label out again after the top correction. When the column can
    // physically fit, fall back to a compact deterministic stack.
    const finalBottom =
      ordered.at(-1)!.y + ordered.at(-1)!.height / 2;
    const packedHeight =
      totalLabelHeight + gap * Math.max(0, ordered.length - 1);
    if (
      finalBottom > bottomLimit + 0.01 &&
      packedHeight <= bottomLimit - topLimit + 0.01
    ) {
      let packedCursor = topLimit;
      ordered.forEach((item) => {
        item.y = packedCursor + item.height / 2;
        packedCursor += item.height + gap;
      });
    }
  });

  return positions;
}

export function shouldShowLeaderLine(
  current: Pick<LabelPosition, "x" | "y">,
  automatic: Pick<LabelPosition, "x" | "y" | "leaderLine"> | undefined,
  isManuallyPositioned: boolean,
  enabled: boolean,
  manualThresholdPx: number,
): boolean {
  if (!enabled || !automatic) return false;
  if (automatic.leaderLine) return true;
  if (!isManuallyPositioned) return false;
  const threshold = Number.isFinite(manualThresholdPx)
    ? Math.max(0, manualThresholdPx)
    : 0;
  return Math.hypot(current.x - automatic.x, current.y - automatic.y) > threshold;
}

export function getLeaderLineGeometry(
  node: LayoutNode,
  label: Pick<LabelPosition, "x" | "y" | "width" | "height">,
): LeaderLineGeometry | null {
  const x0 = Number(node.x0 ?? 0);
  const x1 = Number(node.x1 ?? 0);
  const y0 = Number(node.y0 ?? 0);
  const y1 = Number(node.y1 ?? 0);
  const nodeCenterX = (x0 + x1) / 2;
  const nodeCenterY = (y0 + y1) / 2;
  const labelCenterInsideNode =
    label.x >= x0 && label.x <= x1 && label.y >= y0 && label.y <= y1;
  if (labelCenterInsideNode) return null;

  const dx = label.x - nodeCenterX;
  const dy = label.y - nodeCenterY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const direction = dx >= 0 ? 1 : -1;
    return {
      x1: direction > 0 ? x1 : x0,
      y1: Math.min(y1, Math.max(y0, label.y)),
      x2: label.x - direction * (label.width / 2 + 2),
      y2: label.y,
    };
  }

  const direction = dy >= 0 ? 1 : -1;
  return {
    x1: Math.min(x1, Math.max(x0, label.x)),
    y1: direction > 0 ? y1 : y0,
    x2: label.x,
    y2: label.y - direction * (label.height / 2 + 2),
  };
}

export function countLabelOverlaps(items: LabelPosition[]): number {
  let count = 0;
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const a = items[left];
      const b = items[right];
      const overlaps =
        Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
        Math.abs(a.y - b.y) < (a.height + b.height) / 2;
      if (overlaps) count += 1;
    }
  }
  return count;
}

export function alignLabels(
  items: LabelPosition[],
  operation: AlignOperation,
): Record<string, Pick<LabelOverride, "x" | "y">> {
  const movable = items.filter((item) => !item.locked);
  const result = Object.fromEntries(
    items.map((item) => [item.id, { x: item.x, y: item.y }]),
  );
  if (movable.length < 2) return result;

  const left = Math.min(...movable.map((item) => item.x - item.width / 2));
  const right = Math.max(...movable.map((item) => item.x + item.width / 2));
  const top = Math.min(...movable.map((item) => item.y - item.height / 2));
  const bottom = Math.max(...movable.map((item) => item.y + item.height / 2));

  if (operation === "left") {
    movable.forEach((item) => {
      result[item.id].x = left + item.width / 2;
    });
  } else if (operation === "h-center") {
    const center = (left + right) / 2;
    movable.forEach((item) => {
      result[item.id].x = center;
    });
  } else if (operation === "right") {
    movable.forEach((item) => {
      result[item.id].x = right - item.width / 2;
    });
  } else if (operation === "top") {
    movable.forEach((item) => {
      result[item.id].y = top + item.height / 2;
    });
  } else if (operation === "v-center") {
    const center = (top + bottom) / 2;
    movable.forEach((item) => {
      result[item.id].y = center;
    });
  } else if (operation === "bottom") {
    movable.forEach((item) => {
      result[item.id].y = bottom - item.height / 2;
    });
  } else if (operation === "distribute-x" && movable.length > 2) {
    const ordered = [...movable].sort((a, b) => a.x - b.x);
    const step = (ordered.at(-1)!.x - ordered[0].x) / (ordered.length - 1);
    ordered.forEach((item, index) => {
      result[item.id].x = ordered[0].x + step * index;
    });
  } else if (operation === "distribute-y" && movable.length > 2) {
    const ordered = [...movable].sort((a, b) => a.y - b.y);
    const step = (ordered.at(-1)!.y - ordered[0].y) / (ordered.length - 1);
    ordered.forEach((item, index) => {
      result[item.id].y = ordered[0].y + step * index;
    });
  }

  return result;
}
