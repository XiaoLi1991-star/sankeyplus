import type {
  LabelPosition,
  SankeyDocument,
  SankeyExportSettings,
} from "../types";
import { getPalette } from "../data/palettes";
import {
  summarizeLinkGroupColorMapping,
  summarizeNodeColorMapping,
} from "./colors";
import type { QualityReport } from "./quality";
import type { LayoutGraph } from "./sankey";
import { getNodeId } from "./sankey";

export const APP_VERSION = "0.6.0";
export const ARTBOARD_WIDTH = 1100;
export const ARTBOARD_HEIGHT = 720;
export const MAX_RASTER_PIXELS = 32_000_000;
export const MAX_RASTER_DIMENSION = 16_384;

export function exportPixelSize(
  physicalWidthMm: number,
  dpi: number,
  canvasWidth = ARTBOARD_WIDTH,
  canvasHeight = ARTBOARD_HEIGHT,
): { width: number; height: number; physicalHeightMm: number } {
  const safeWidthMm = Math.min(500, Math.max(30, physicalWidthMm || 30));
  const safeDpi = Math.min(1200, Math.max(72, dpi || 300));
  const width = Math.round((safeWidthMm / 25.4) * safeDpi);
  const safeCanvasWidth = Math.max(1, canvasWidth || ARTBOARD_WIDTH);
  const safeCanvasHeight = Math.max(1, canvasHeight || ARTBOARD_HEIGHT);
  const height = Math.round((width * safeCanvasHeight) / safeCanvasWidth);
  return {
    width,
    height,
    physicalHeightMm: (safeWidthMm * safeCanvasHeight) / safeCanvasWidth,
  };
}

export function exportSettingsForPhysicalSize(
  current: SankeyExportSettings,
  physicalWidthMm: number,
  dpi: number,
  canvasWidth = ARTBOARD_WIDTH,
  canvasHeight = ARTBOARD_HEIGHT,
): SankeyExportSettings {
  const size = exportPixelSize(physicalWidthMm, dpi, canvasWidth, canvasHeight);
  return {
    ...current,
    profileId: "custom",
    physicalWidthMm: Math.min(500, Math.max(30, physicalWidthMm || 30)),
    dpi: Math.min(1200, Math.max(72, Math.round(dpi || 300))),
    width: size.width,
    height: size.height,
  };
}

export function svgUnitsForPointSize(
  pointSize: number,
  physicalWidthMm: number,
  canvasWidth = ARTBOARD_WIDTH,
): number {
  const widthInPoints = (physicalWidthMm / 25.4) * 72;
  return (Math.max(0, pointSize) * canvasWidth) / widthInPoints;
}

export function effectivePointSize(
  svgUnits: number,
  physicalWidthMm: number,
  canvasWidth = ARTBOARD_WIDTH,
): number {
  return (Math.max(0, svgUnits) / canvasWidth) * (physicalWidthMm / 25.4) * 72;
}

function parseHex(color: string): [number, number, number] {
  const normalized = color.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => part + part)
          .join("")
      : normalized;
  const value = Number.parseInt(expanded, 16);
  if (!Number.isFinite(value)) return [100, 116, 139];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function compositeOnWhite(color: string, opacity = 1): string {
  const [red, green, blue] = parseHex(color);
  const blend = (channel: number) =>
    Math.round(channel * opacity + 255 * (1 - opacity));
  return `#${[blend(red), blend(green), blend(blue)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function relativeLuminance(color: string): number {
  const channels = parseHex(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

export function readableTextColor(background: string): "#111827" | "#FFFFFF" {
  return contrastRatio("#111827", background) >= contrastRatio("#FFFFFF", background)
    ? "#111827"
    : "#FFFFFF";
}

export type PublicationIssueSeverity = "warning" | "info";

export interface PublicationIssue {
  id: string;
  severity: PublicationIssueSeverity;
  title: string;
  detail: string;
}

export interface PublicationPreflight {
  issues: PublicationIssue[];
  warningCount: number;
  infoCount: number;
  effectiveLabelPt: number;
  minimumTextPt: number;
  physicalHeightMm: number;
}

interface PreflightInput {
  document: SankeyDocument;
  qualityReport: QualityReport;
  labels: LabelPosition[];
  graph: LayoutGraph | null;
  colors: Map<string, string>;
}

function issue(
  id: string,
  severity: PublicationIssueSeverity,
  title: string,
  detail: string,
): PublicationIssue {
  return { id, severity, title, detail };
}

export function buildPublicationPreflight({
  document,
  qualityReport,
  labels,
  graph,
  colors,
}: PreflightInput): PublicationPreflight {
  const issues: PublicationIssue[] = [];
  const minimumTextPt = 6;
  const effectiveLabelPt = effectivePointSize(
    document.settings.fontSize,
    document.exportSettings.physicalWidthMm,
    document.settings.canvasWidth,
  );
  const physicalHeightMm =
    (document.exportSettings.physicalWidthMm * document.settings.canvasHeight) /
    document.settings.canvasWidth;
  const rasterPixels =
    document.exportSettings.width * document.exportSettings.height;

  if (
    rasterPixels > MAX_RASTER_PIXELS ||
    document.exportSettings.width > MAX_RASTER_DIMENSION ||
    document.exportSettings.height > MAX_RASTER_DIMENSION
  ) {
    issues.push(
      issue(
        "raster-memory",
        "warning",
        "光栅尺寸超过安全上限",
        `${document.exportSettings.width.toLocaleString("zh-CN")} × ${document.exportSettings.height.toLocaleString("zh-CN")} px 可能耗尽浏览器内存，光栅导出可能失败；建议降低毫米宽度或 DPI。SVG / PDF 不受此限制。`,
      ),
    );
  }

  if (qualityReport.errorCount > 0) {
    issues.push(
      issue(
        "data-errors",
        "warning",
        `${qualityReport.errorCount} 个数据错误`,
        "无效值、自连接或循环流可能使图形不完整，建议回到数据检查中处理。",
      ),
    );
  }
  if (graph && labels.length !== graph.nodes.length) {
    issues.push(
      issue(
        "layout-pending",
        "warning",
        "标签几何仍在计算",
        "请等待画布完成排版后再导出。",
      ),
    );
  }
  if (qualityReport.warningCount > 0) {
    issues.push(
      issue(
        "data-warnings",
        "warning",
        `${qualityReport.warningCount} 个数据警告`,
        "请确认重复流向、首尾空格或流量不守恒具有明确的数据含义。",
      ),
    );
  }

  if (effectiveLabelPt + 0.01 < minimumTextPt) {
    issues.push(
      issue(
        "label-size",
        "warning",
        `最终标签仅 ${effectiveLabelPt.toFixed(1)} pt`,
        `建议最终标签至少达到 ${minimumTextPt.toFixed(1)} pt；请增大标签字号或改用更宽版面。`,
      ),
    );
  }
  let overlapCount = 0;
  for (let left = 0; left < labels.length; left += 1) {
    for (let right = left + 1; right < labels.length; right += 1) {
      const a = labels[left];
      const b = labels[right];
      if (
        Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
        Math.abs(a.y - b.y) < (a.height + b.height) / 2
      ) {
        overlapCount += 1;
      }
    }
  }
  if (overlapCount > 0) {
    issues.push(
      issue(
        "label-overlap",
        "warning",
        `${overlapCount} 处标签重叠`,
        "请拖动、缩短或批量对齐标签，直到所有标签包围盒分离。",
      ),
    );
  }

  const outside = labels.filter(
    (label) =>
      label.x - label.width / 2 < 24 ||
      label.x + label.width / 2 > document.settings.canvasWidth - 24 ||
      label.y - label.height / 2 < 42 ||
      label.y + label.height / 2 > document.settings.canvasHeight - 42,
  );
  if (outside.length > 0) {
    issues.push(
      issue(
        "label-bounds",
        "warning",
        `${outside.length} 个标签超出安全区`,
        `请调整：${outside.slice(0, 4).map((label) => label.id).join("、")}${outside.length > 4 ? "等" : ""}。`,
      ),
    );
  }

  const lowContrastLabels: string[] = [];
  for (const node of graph?.nodes ?? []) {
    const id = getNodeId(node);
    const label = labels.find((candidate) => candidate.id === id);
    if (!label) continue;
    const inside =
      label.x - label.width / 2 >= (node.x0 ?? 0) &&
      label.x + label.width / 2 <= (node.x1 ?? 0) &&
      label.y - label.height / 2 >= (node.y0 ?? 0) &&
      label.y + label.height / 2 <= (node.y1 ?? 0);
    const background = inside
      ? compositeOnWhite(colors.get(id) ?? "#64748B", 0.92)
      : "#FFFFFF";
    const foreground =
      document.labelColorOverrides[id] ?? document.settings.fontColor;
    if (contrastRatio(foreground, background) < 4.5) lowContrastLabels.push(id);
  }
  if (lowContrastLabels.length > 0) {
    issues.push(
      issue(
        "label-contrast",
        "warning",
        `${lowContrastLabels.length} 个标签对比度不足`,
        `请将标签移到色块外或由用户显式修改该标签颜色：${lowContrastLabels.slice(0, 4).join("、")}${lowContrastLabels.length > 4 ? "等" : ""}。`,
      ),
    );
  }

  const palette = getPalette(document.settings.paletteId);
  const colorMapping = summarizeNodeColorMapping(
    graph,
    document.settings.nodeColorMode,
    palette.colors.length,
  );
  if (colorMapping.repeatsColors) {
    issues.push(
      issue(
        "palette-capacity",
        "warning",
        `颜色类别超过 ${palette.name} 容量`,
        `${colorMapping.categoryCount} 个颜色类别将复用 ${colorMapping.paletteCapacity} 种颜色；建议改用分组、阶段或中性色映射。`,
      ),
    );
  }
  if (colorMapping.missingGroupCount > 0) {
    issues.push(
      issue(
        "missing-node-groups",
        "warning",
        `${colorMapping.missingGroupCount} 个节点缺少分组`,
        "按节点分组着色时，这些节点会使用统一中性色；可在数据表的可选分组列中补充。",
      ),
    );
  }
  if (document.settings.linkColorMode === "group") {
    const linkColorMapping = summarizeLinkGroupColorMapping(
      graph,
      palette.colors.length,
    );
    if (linkColorMapping.repeatsColors) {
      issues.push(
        issue(
          "link-palette-capacity",
          "warning",
          "连接分组超过色板容量",
          `${linkColorMapping.categoryCount} 个连接类别将复用 ${linkColorMapping.paletteCapacity} 种颜色。`,
        ),
      );
    }
    if (linkColorMapping.missingGroupCount > 0) {
      issues.push(
        issue(
          "missing-link-groups",
          "warning",
          `${linkColorMapping.missingGroupCount} 条连接缺少分组`,
          "按连接分组着色时，这些色带会使用中性色。",
        ),
      );
    }
  }

  if (document.exportSettings.background === "transparent") {
    issues.push(
      issue(
        "transparent-contrast",
        "warning",
        "透明背景对比度按白底评估",
        "放入深色页面或彩色版面后请重新检查文字和流带对比度。",
      ),
    );
  }
  if (!["arial", "times", "sans"].includes(document.settings.fontFamily)) {
    issues.push(
      issue(
        "font-portability",
        "warning",
        "当前字体并非通用投稿字体",
        "建议使用 Arial、Times New Roman 或开源 Noto Sans，并在最终 PDF/EPS 中嵌入字体。",
      ),
    );
  } else {
    issues.push(
      issue(
        "font-embedding",
        "info",
        "SVG 保留可编辑文字",
        "提交前仍需在排版软件中确认字体已嵌入且没有发生替换。",
      ),
    );
  }

  if ((graph?.nodes.length ?? 0) > 40) {
    issues.push(
      issue(
        "dense-figure",
        "warning",
        "节点数量较多",
        "发表图应优先呈现主路径；可将完整网络放入补充材料。",
      ),
    );
  }

  const columnCounts = new Map<number, number>();
  for (const node of graph?.nodes ?? []) {
    const depth = Number(node.depth ?? 0);
    columnCounts.set(depth, (columnCounts.get(depth) ?? 0) + 1);
  }
  const densestColumn = Math.max(0, ...columnCounts.values());
  if (densestColumn > 18) {
    issues.push(
      issue(
        "dense-column",
        "warning",
        `单列包含 ${densestColumn} 个节点`,
        "建议增加画布高度、只显示名称、调整节点顺序，或按需要隐藏部分标签。",
      ),
    );
  }

  const positiveLinkWidths = (graph?.links ?? [])
    .map((link) => Number(link.width ?? 0))
    .filter((width) => width > 0);
  if (
    positiveLinkWidths.length > 0 &&
    effectivePointSize(
      Math.min(...positiveLinkWidths),
      document.exportSettings.physicalWidthMm,
      document.settings.canvasWidth,
    ) < 0.25
  ) {
    issues.push(
      issue(
        "thin-flow",
        "warning",
        "存在缩印后可能消失的极细流带",
        "最细流带低于 0.25 pt；请考虑拆图、合并极小类别或在图注中说明。",
      ),
    );
  }

  return {
    issues,
    warningCount: issues.filter((item) => item.severity === "warning").length,
    infoCount: issues.filter((item) => item.severity === "info").length,
    effectiveLabelPt,
    minimumTextPt,
    physicalHeightMm,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const input = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildPublicationManifest(
  document: SankeyDocument,
  preflight: PublicationPreflight,
  denominatorLabel: string,
) {
  const nodes = new Set(
    document.rows.flatMap((row) => [row.source.trim(), row.target.trim()]),
  );
  return {
    tool: "SankeyPlus",
    toolVersion: APP_VERSION,
    schemaVersion: document.schemaVersion,
    generatedAt: new Date().toISOString(),
    documentTitle: document.title,
    dataSha256: await sha256(
      document.rows.map((row) => ({
        source: row.source.trim(),
        target: row.target.trim(),
        value: row.value,
        sourceGroup: row.sourceGroup?.trim() || "",
        targetGroup: row.targetGroup?.trim() || "",
        linkGroup: row.linkGroup?.trim() || "",
      })),
    ),
    documentSha256: await sha256(document),
    settingsSha256: await sha256({
      settings: document.settings,
      nodeColors: document.nodeColors,
      labelOverrides: document.labelOverrides,
      labelTextOverrides: document.labelTextOverrides,
      labelColorOverrides: document.labelColorOverrides,
      nodeOverrides: document.nodeOverrides,
      metadata: document.metadata,
      exportSettings: document.exportSettings,
    }),
    dataSummary: {
      nodes: nodes.size,
      links: document.rows.length,
      unit: document.metadata.unit,
      denominator: denominatorLabel,
    },
    output: {
      profileId: document.exportSettings.profileId,
      physicalWidthMm: document.exportSettings.physicalWidthMm,
      physicalHeightMm: preflight.physicalHeightMm,
      dpi: document.exportSettings.dpi,
      pixelWidth: document.exportSettings.width,
      pixelHeight: document.exportSettings.height,
      effectiveLabelPt: preflight.effectiveLabelPt,
      canvasWidth: document.settings.canvasWidth,
      canvasHeight: document.settings.canvasHeight,
    },
    preflight: {
      warnings: preflight.warningCount,
      information: preflight.infoCount,
      issues: preflight.issues,
    },
  };
}
