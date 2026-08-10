import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  Italic,
  LockKeyhole,
  Minus,
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LABEL_FONT_OPTIONS } from "../data/fonts";
import { SCIENTIFIC_PALETTES } from "../data/palettes";
import type {
  AlignOperation,
  LabelFontFamily,
  LabelMode,
  LabelOperationScope,
  LabelPlacement,
  LabelScopeOption,
  LinkColorMode,
  NodeColorMode,
  PercentageBasis,
  ProofMode,
  SankeyAlignment,
  SankeyExportSettings,
  SankeySettings,
} from "../types";
import type { ColorMappingSummary } from "../utils/colors";
import type { PublicationPreflight } from "../utils/publication";
import { exportSettingsForPhysicalSize } from "../utils/publication";
import {
  MAX_CANVAS_HEIGHT,
  MAX_CANVAS_WIDTH,
  MIN_CANVAS_HEIGHT,
  MIN_CANVAS_WIDTH,
} from "../utils/canvasViewport";
import type { DataPanelTab } from "./DataPanel";
import { Field, IconButton, InspectorSection } from "./ui";

interface InspectorProps {
  settings: SankeySettings;
  exportSettings: SankeyExportSettings;
  percentageLabel: string;
  publicationPreflight: PublicationPreflight;
  proofMode: ProofMode;
  nodeColorEntries: NodeColorEntry[];
  colorMappingSummary: ColorMappingSummary;
  linkColorMappingSummary: ColorMappingSummary;
  selectedCount: number;
  selectedLabelId: string | null;
  selectedLabelText: string;
  selectedLabelColor: string;
  selectedLabelHasCustomColor: boolean;
  labelScope: LabelOperationScope;
  labelScopeOptions: LabelScopeOption[];
  scopeCount: number;
  allScopedLocked: boolean;
  alignmentHasVisibleEffect: boolean;
  onSettingsChange: (patch: Partial<SankeySettings>) => void;
  onCanvasSizeChange: (width: number, height: number) => void;
  onExportSettingsChange: (patch: Partial<SankeyExportSettings>) => void;
  onProofModeChange: (mode: ProofMode) => void;
  onOpenDataPanel: (tab: DataPanelTab) => void;
  onNodeColorChange: (nodeId: string, color?: string) => void;
  onAlign: (operation: AlignOperation) => void;
  onNudge: (dx: number, dy: number) => void;
  onLabelTextChange: (text: string) => void;
  onLabelColorChange: (color?: string) => void;
  onLabelScopeChange: (scope: LabelOperationScope) => void;
  onToggleLock: () => void;
  onResetLabels: () => void;
  onClose: () => void;
  mobileOpen: boolean;
}

type InspectorTab = "style" | "labels" | "layout" | "export";

interface NodeColorEntry {
  id: string;
  color: string;
  isCustom: boolean;
}

interface LabelTextEditorProps {
  labelId: string;
  customText: string;
  onChange: (text: string) => void;
}

interface LabelColorControlProps {
  value: string;
  onChange: (value: string) => void;
}

function LabelColorControl({
  value,
  onChange,
}: LabelColorControlProps) {
  const safeValue = /^#[0-9a-f]{6}$/i.test(value ?? "")
    ? value
    : "#111827";
  const [draft, setDraft] = useState(safeValue.toUpperCase());

  const commit = () => {
    if (/^#[0-9a-f]{6}$/i.test(draft)) {
      onChange(draft.toUpperCase());
    } else {
      setDraft(safeValue.toUpperCase());
    }
  };

  return (
    <div className="font-color-control">
      <input
        aria-label="选择字体颜色"
        type="color"
        value={safeValue}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
      />
      <input
        aria-label="字体颜色十六进制"
        value={draft}
        spellCheck={false}
        maxLength={7}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }}
      />
    </div>
  );
}

function LabelTextEditor({
  labelId,
  customText,
  onChange,
}: LabelTextEditorProps) {
  const [draft, setDraft] = useState(customText);
  const changed = draft !== customText;

  return (
    <div className="label-text-editor">
      <Field label={`自定义文字 · ${labelId}`} hint="支持换行；留空后应用可恢复自动内容。">
        <textarea
          aria-label="标签文字"
          rows={3}
          value={draft}
          placeholder="留空时使用名称、数值和百分比"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onChange(draft);
            }
          }}
        />
      </Field>
      <div className="label-text-editor__actions">
        <button
          type="button"
          className="primary-button"
          disabled={!changed}
          onClick={() => onChange(draft)}
        >
          应用文字
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!customText}
          onClick={() => onChange("")}
        >
          恢复自动文字
        </button>
      </div>
    </div>
  );
}

const alignmentButtons: Array<{
  operation: AlignOperation;
  label: string;
  icon: typeof AlignLeft;
}> = [
  { operation: "left", label: "左对齐", icon: AlignLeft },
  { operation: "h-center", label: "水平居中", icon: AlignCenter },
  { operation: "right", label: "右对齐", icon: AlignRight },
  { operation: "top", label: "顶部对齐", icon: ArrowUpToLine },
  { operation: "v-center", label: "垂直居中", icon: Minus },
  { operation: "bottom", label: "底部对齐", icon: ArrowDownToLine },
  { operation: "distribute-x", label: "水平分布", icon: MoveHorizontal },
  { operation: "distribute-y", label: "垂直分布", icon: MoveVertical },
];

export function Inspector({
  settings,
  exportSettings,
  percentageLabel,
  publicationPreflight,
  proofMode,
  nodeColorEntries,
  colorMappingSummary,
  linkColorMappingSummary,
  selectedCount,
  selectedLabelId,
  selectedLabelText,
  selectedLabelColor,
  selectedLabelHasCustomColor,
  labelScope,
  labelScopeOptions,
  scopeCount,
  allScopedLocked,
  alignmentHasVisibleEffect,
  onSettingsChange,
  onCanvasSizeChange,
  onExportSettingsChange,
  onProofModeChange,
  onOpenDataPanel,
  onNodeColorChange,
  onAlign,
  onNudge,
  onLabelTextChange,
  onLabelColorChange,
  onLabelScopeChange,
  onToggleLock,
  onResetLabels,
  onClose,
  mobileOpen,
}: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>("style");
  const [canvasDraft, setCanvasDraft] = useState({
    width: String(settings.canvasWidth),
    height: String(settings.canvasHeight),
  });
  const previousSelectedCount = useRef(selectedCount);
  const hasScope = scopeCount > 0;
  const draftCanvasWidth = Number(canvasDraft.width);
  const draftCanvasHeight = Number(canvasDraft.height);
  const canvasDraftValid =
    Number.isFinite(draftCanvasWidth) &&
    draftCanvasWidth >= MIN_CANVAS_WIDTH &&
    draftCanvasWidth <= MAX_CANVAS_WIDTH &&
    Number.isFinite(draftCanvasHeight) &&
    draftCanvasHeight >= MIN_CANVAS_HEIGHT &&
    draftCanvasHeight <= MAX_CANVAS_HEIGHT;
  const canvasSizeChanged =
    Math.round(draftCanvasWidth) !== settings.canvasWidth ||
    Math.round(draftCanvasHeight) !== settings.canvasHeight;
  const activePalette = SCIENTIFIC_PALETTES.find(
    (palette) => palette.id === settings.paletteId,
  ) ?? SCIENTIFIC_PALETTES[0];
  const expectsOrderedPalette = settings.nodeColorMode === "stage";
  const paletteKindMismatch =
    settings.nodeColorMode !== "single" &&
    (expectsOrderedPalette
      ? activePalette.kind !== "ordered"
      : activePalette.kind !== "categorical");

  useEffect(() => {
    if (previousSelectedCount.current === 0 && selectedCount > 0) {
      setTab("labels");
    }
    previousSelectedCount.current = selectedCount;
  }, [selectedCount]);

  useEffect(() => {
    setCanvasDraft({
      width: String(settings.canvasWidth),
      height: String(settings.canvasHeight),
    });
  }, [settings.canvasHeight, settings.canvasWidth]);

  const publicationIssueAction = (id: string) => {
    switch (id) {
      case "raster-memory":
        return {
          label: "降低到 300 dpi",
          run: () =>
            onExportSettingsChange(
              exportSettingsForPhysicalSize(
                exportSettings,
                exportSettings.physicalWidthMm,
                300,
                settings.canvasWidth,
                settings.canvasHeight,
              ),
            ),
        };
      case "transparent-contrast":
        return {
          label: "改为白色背景",
          run: () => onExportSettingsChange({ background: "white" }),
        };
      case "data-errors":
      case "data-warnings":
        return {
          label: "查看数据检查",
          run: () => onOpenDataPanel("quality"),
        };
      case "missing-node-groups":
      case "missing-link-groups":
        return {
          label: "编辑分组数据",
          run: () => onOpenDataPanel("data"),
        };
      case "label-size":
      case "label-overlap":
      case "label-bounds":
      case "font-embedding":
      case "font-portability":
        return { label: "前往标签设置", run: () => setTab("labels") };
      case "label-contrast":
      case "palette-capacity":
      case "link-palette-capacity":
        return { label: "前往颜色设置", run: () => setTab("style") };
      case "dense-column":
      case "dense-figure":
      case "thin-flow":
        return { label: "前往布局设置", run: () => setTab("layout") };
      default:
        return null;
    }
  };

  return (
    <aside
      className={`side-panel inspector-panel ${mobileOpen ? "is-mobile-open" : ""}`}
      aria-label="属性面板"
    >
      <div className="mobile-sheet-handle mobile-only" />
      <div className="panel-tabs">
        {(
          [
            ["style", "颜色"],
            ["labels", "标签"],
            ["layout", "布局"],
            ["export", "输出"],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={tab === id ? "is-active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <IconButton
          className="mobile-only panel-close"
          icon={X}
          label="关闭设置面板"
          size="compact"
          onClick={onClose}
        />
      </div>

      <div className="inspector-scroll">
        {tab === "style" ? (
          <>
            <InspectorSection
              title="节点颜色映射"
              description="颜色映射只依据通用数据字段，不推断具体领域含义。"
            >
              <Field label="映射方式">
                <select
                  aria-label="节点颜色映射方式"
                  value={settings.nodeColorMode}
                  onChange={(event) =>
                    onSettingsChange({
                      nodeColorMode: event.target.value as NodeColorMode,
                    })
                  }
                >
                  <option value="single">统一颜色</option>
                  <option value="stage">按所在阶段</option>
                  <option value="group">按节点分组</option>
                  <option value="individual">每个节点独立</option>
                </select>
              </Field>
              {settings.nodeColorMode === "single" ? (
                <Field label="统一节点颜色">
                  <div className="single-color-control">
                    <input
                      aria-label="统一节点颜色"
                      type="color"
                      value={settings.nodeBaseColor}
                      onChange={(event) =>
                        onSettingsChange({
                          nodeBaseColor: event.target.value.toUpperCase(),
                        })
                      }
                    />
                    <code>{settings.nodeBaseColor.toUpperCase()}</code>
                  </div>
                </Field>
              ) : null}
              <div
                className={`mapping-summary ${
                  colorMappingSummary.repeatsColors ||
                  colorMappingSummary.missingGroupCount > 0 ||
                  paletteKindMismatch
                    ? "is-warning"
                    : ""
                }`}
              >
                <strong>
                  {colorMappingSummary.categoryCount} 个颜色类别 · 色板容量{" "}
                  {colorMappingSummary.paletteCapacity}
                </strong>
                {colorMappingSummary.repeatsColors ? (
                  <span>类别数超过色板容量，颜色会有意复用。</span>
                ) : null}
                {colorMappingSummary.missingGroupCount > 0 ? (
                  <span>
                    {colorMappingSummary.missingGroupCount} 个节点没有分组，将使用中性色。
                  </span>
                ) : null}
                {paletteKindMismatch ? (
                  <span>
                    {expectsOrderedPalette
                      ? "按阶段建议使用有序色板。"
                      : "无序分类建议使用分类色板。"}
                  </span>
                ) : null}
              </div>
            </InspectorSection>

            <InspectorSection
              title="色板"
              description="分类色板用于无序组别；有序色板用于阶段或连续顺序。"
            >
              <div className="palette-list">
                {SCIENTIFIC_PALETTES.map((palette) => (
                  <button
                    type="button"
                    className={`palette-option ${
                      settings.paletteId === palette.id ? "is-selected" : ""
                    }`}
                    key={palette.id}
                    onClick={() =>
                      onSettingsChange({ paletteId: palette.id })
                    }
                  >
                    <span className="palette-option__heading">
                      <strong>{palette.name}</strong>
                      <span className="palette-option__meta">
                        <small>{palette.kind === "ordered" ? "有序" : "分类"}</small>
                        <span className="palette-radio" />
                      </span>
                    </span>
                    <span className="palette-swatches">
                      {palette.colors.map((color, index) => (
                        <i
                          key={`${palette.id}-${index}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </InspectorSection>

            <InspectorSection
              title="单节点颜色覆盖"
              description="手动设置优先于自动映射；恢复后重新使用当前映射规则。"
            >
              <div className="node-color-list">
                {nodeColorEntries.map((entry) => (
                  <div className="node-color-row" key={entry.id}>
                    <span title={entry.id}>{entry.id}</span>
                    <input
                      type="color"
                      aria-label={`${entry.id} 节点颜色`}
                      value={entry.color}
                      onChange={(event) =>
                        onNodeColorChange(entry.id, event.target.value)
                      }
                    />
                    <IconButton
                      icon={RotateCcw}
                      label={`恢复 ${entry.id} 的色板颜色`}
                      size="compact"
                      disabled={!entry.isCustom}
                      onClick={() => onNodeColorChange(entry.id)}
                    />
                  </div>
                ))}
              </div>
            </InspectorSection>

            <InspectorSection
              title="标签颜色"
              description="所有标签默认使用同一颜色；只有明确选择标签后，才会产生单独覆盖。"
            >
              <Field label="全局标签颜色">
                <LabelColorControl
                  key={settings.fontColor}
                  value={settings.fontColor}
                  onChange={(fontColor) => onSettingsChange({ fontColor })}
                />
              </Field>
              {selectedLabelId ? (
                <>
                  <Field label={`单独覆盖 · ${selectedLabelId}`}>
                    <LabelColorControl
                      key={`${selectedLabelId}:${selectedLabelColor}`}
                      value={selectedLabelColor}
                      onChange={(color) => onLabelColorChange(color)}
                    />
                  </Field>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!selectedLabelHasCustomColor}
                    onClick={() => onLabelColorChange()}
                  >
                    恢复全局标签颜色
                  </button>
                </>
              ) : (
                <p className="field-hint">在画布选择一个标签后，可在这里单独设置颜色。</p>
              )}
            </InspectorSection>

            <InspectorSection title="流带样式">
              <Field label="着色方式">
                <select
                  value={settings.linkColorMode}
                  onChange={(event) =>
                    onSettingsChange({
                      linkColorMode: event.target.value as LinkColorMode,
                    })
                  }
                >
                  <option value="source">跟随来源节点</option>
                  <option value="target">跟随目标节点</option>
                  <option value="gradient">来源—目标渐变</option>
                  <option value="group">按连接分组</option>
                  <option value="neutral">统一中性色</option>
                </select>
              </Field>
              {settings.linkColorMode === "group" ? (
                <div
                  className={`mapping-summary ${
                    linkColorMappingSummary.repeatsColors ||
                    linkColorMappingSummary.missingGroupCount > 0
                      ? "is-warning"
                      : ""
                  }`}
                >
                  <strong>
                    {linkColorMappingSummary.categoryCount} 个连接类别 · 色板容量{" "}
                    {linkColorMappingSummary.paletteCapacity}
                  </strong>
                  {linkColorMappingSummary.repeatsColors ? (
                    <span>连接类别超过色板容量，颜色会复用。</span>
                  ) : null}
                  {linkColorMappingSummary.missingGroupCount > 0 ? (
                    <span>
                      {linkColorMappingSummary.missingGroupCount} 条连接没有分组，将使用中性色。
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="range-field">
                <div className="range-field__heading">
                  <span>透明度</span>
                  <div className="numeric-suffix">
                    <input
                      aria-label="流带透明度"
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(settings.linkOpacity * 100)}
                      onChange={(event) =>
                        onSettingsChange({
                          linkOpacity: Math.min(
                            1,
                            Math.max(0, Number(event.target.value) / 100),
                          ),
                        })
                      }
                    />
                    <span>%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.linkOpacity * 100}
                  onChange={(event) =>
                    onSettingsChange({
                      linkOpacity: Number(event.target.value) / 100,
                    })
                  }
                />
              </div>
            </InspectorSection>
            <InspectorSection
              title="色觉校样"
              description="只改变画布预览，不写入 SVG、PNG 或文档。"
            >
              <Field label="预览模式">
                <select
                  value={proofMode}
                  onChange={(event) =>
                    onProofModeChange(event.target.value as ProofMode)
                  }
                >
                  <option value="normal">正常色彩</option>
                  <option value="grayscale">灰度打印</option>
                  <option value="protanopia">红色觉缺陷模拟</option>
                  <option value="deuteranopia">绿色觉缺陷模拟</option>
                </select>
              </Field>
            </InspectorSection>
          </>
        ) : null}

        {tab === "labels" ? (
          <>
            <InspectorSection
              title="标签文字"
              description={
                selectedLabelId
                  ? "自定义内容只改变显示文字，不修改流向数据。"
                  : selectedCount > 1
                    ? "一次只能编辑一个标签的文字。"
                    : "先在画布中选择一个标签。"
              }
            >
              {selectedLabelId ? (
                <LabelTextEditor
                  key={`${selectedLabelId}:${selectedLabelText}`}
                  labelId={selectedLabelId}
                  customText={selectedLabelText}
                  onChange={onLabelTextChange}
                />
              ) : null}
            </InspectorSection>

            <InspectorSection
              title="标签字体"
              description="字体、字号和字形只在这里设置，并全局应用到标签。"
            >
              <Field label="字体">
                <select
                  aria-label="标签字体"
                  value={settings.fontFamily}
                  onChange={(event) =>
                    onSettingsChange({
                      fontFamily: event.target.value as LabelFontFamily,
                    })
                  }
                >
                  {LABEL_FONT_OPTIONS.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="字号"
                hint={`当前成品约 ${publicationPreflight.effectiveLabelPt.toFixed(1)} pt`}
              >
                <div className="numeric-suffix">
                  <input
                    type="number"
                    min="8"
                    max="60"
                    step="0.5"
                    value={settings.fontSize}
                    onChange={(event) =>
                      onSettingsChange({
                        fontSize: Number(event.target.value),
                      })
                    }
                  />
                  <span>px</span>
                </div>
              </Field>
              <Field label="字形">
                <div className="font-style-buttons">
                  <button
                    type="button"
                    className={
                      settings.fontWeight === 700 ? "is-active" : ""
                    }
                    aria-pressed={settings.fontWeight === 700}
                    aria-label="标签加粗"
                    onClick={() =>
                      onSettingsChange({
                        fontWeight:
                          settings.fontWeight === 700 ? 500 : 700,
                      })
                    }
                  >
                    <Bold aria-hidden="true" />
                    加粗
                  </button>
                  <button
                    type="button"
                    className={
                      settings.fontStyle === "italic" ? "is-active" : ""
                    }
                    aria-pressed={settings.fontStyle === "italic"}
                    aria-label="标签斜体"
                    onClick={() =>
                      onSettingsChange({
                        fontStyle:
                          settings.fontStyle === "italic"
                            ? "normal"
                            : "italic",
                      })
                    }
                  >
                    <Italic aria-hidden="true" />
                    斜体
                  </button>
                </div>
              </Field>
              <Field
                label="默认标签位置"
                hint="节点外更清晰；优先节点内会在空间不足时自动外置。"
              >
                <select
                  aria-label="默认标签位置"
                  value={settings.labelPlacement}
                  onChange={(event) =>
                    onSettingsChange({
                      labelPlacement: event.target.value as LabelPlacement,
                    })
                  }
                >
                  <option value="outside">节点外（推荐）</option>
                  <option value="inside">优先节点内</option>
                </select>
              </Field>
              <Field label="标签内容">
                <select
                  value={settings.labelMode}
                  onChange={(event) =>
                    onSettingsChange({
                      labelMode: event.target.value as LabelMode,
                    })
                  }
                >
                  <option value="name">名称</option>
                  <option value="name-value">名称 + 数值</option>
                  <option value="name-percent">名称 + 百分比</option>
                  <option value="name-value-percent">
                    名称 + 数值 + 百分比
                  </option>
                </select>
              </Field>
              <Field label="百分比分母" hint={percentageLabel}>
                <select
                  value={settings.percentageBasis}
                  onChange={(event) =>
                    onSettingsChange({
                      percentageBasis: event.target.value as PercentageBasis,
                    })
                  }
                >
                  <option value="cohort">首列总量</option>
                  <option value="column">各列总量</option>
                  <option value="custom">自定义固定分母</option>
                </select>
              </Field>
              {settings.percentageBasis === "custom" ? (
                <Field label="自定义分母">
                  <input
                    type="number"
                    min="0.000001"
                    step="1"
                    value={settings.customDenominator}
                    onChange={(event) =>
                      onSettingsChange({
                        customDenominator: Math.max(
                          0.000001,
                          Number(event.target.value) || 1,
                        ),
                      })
                    }
                  />
                </Field>
              ) : null}
              <Field label="数值小数位">
                <select
                  value={settings.valueDecimals}
                  onChange={(event) =>
                    onSettingsChange({ valueDecimals: Number(event.target.value) })
                  }
                >
                  {[0, 1, 2, 3].map((value) => (
                    <option key={value} value={value}>
                      {value} 位
                    </option>
                  ))}
                </select>
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={settings.showLeaderLines}
                  onChange={(event) =>
                    onSettingsChange({
                      showLeaderLines: event.target.checked,
                    })
                  }
                />
                显示引导线
              </label>
              <Field
                label="手动移动阈值"
                hint="标签相对自动位置移动超过此距离时显示；自动外置标签不受此阈值影响。"
              >
                <div className="numeric-suffix">
                  <input
                    type="number"
                    min="0"
                    max="200"
                    step="1"
                    disabled={!settings.showLeaderLines}
                    value={settings.leaderLineThresholdPx}
                    onChange={(event) =>
                      onSettingsChange({
                        leaderLineThresholdPx: Math.min(
                          200,
                          Math.max(0, Math.round(Number(event.target.value) || 0)),
                        ),
                      })
                    }
                  />
                  <span>px</span>
                </div>
              </Field>
            </InspectorSection>

            <InspectorSection
              title="批量操作范围"
              description="选择某列或全部后，移动、对齐、锁定和重置会作用于整个范围。"
            >
              <Field
                label="操作范围"
                hint={`当前范围包含 ${scopeCount} 个标签；已锁定标签会跳过移动和对齐。`}
              >
                <select
                  aria-label="标签批量操作范围"
                  value={labelScope}
                  onChange={(event) =>
                    onLabelScopeChange(
                      event.target.value as LabelOperationScope,
                    )
                  }
                >
                  {labelScopeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </InspectorSection>

            <InspectorSection
              title="标签排列"
              description={`当前操作范围：${scopeCount} 个标签`}
            >
              <div className="alignment-grid">
                {alignmentButtons.map(
                  ({ operation, label, icon: AlignmentIcon }) => (
                    <button
                      type="button"
                      key={operation}
                      disabled={scopeCount < 2}
                      title={label}
                      aria-label={label}
                      onClick={() => onAlign(operation)}
                    >
                      <AlignmentIcon aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ),
                )}
              </div>
              <div className="label-action-row">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!hasScope}
                  onClick={onToggleLock}
                >
                  <LockKeyhole aria-hidden="true" />
                  {allScopedLocked ? "解锁位置" : "锁定位置"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!hasScope}
                  onClick={onResetLabels}
                >
                  <RotateCcw aria-hidden="true" />
                  重置位置
                </button>
              </div>
            </InspectorSection>

            <InspectorSection
              title="批量移动"
              description="先按 10 px 快速移动，再用 1 px 微调。"
            >
              <div className="batch-nudge-grid">
                <button
                  type="button"
                  disabled={!hasScope}
                  aria-label="向左移动 10 px"
                  onClick={() => onNudge(-10, 0)}
                >
                  <ArrowLeft aria-hidden="true" />
                  左移 10
                </button>
                <button
                  type="button"
                  disabled={!hasScope}
                  aria-label="向右移动 10 px"
                  onClick={() => onNudge(10, 0)}
                >
                  <ArrowRight aria-hidden="true" />
                  右移 10
                </button>
                <button
                  type="button"
                  disabled={!hasScope}
                  aria-label="向上移动 10 px"
                  onClick={() => onNudge(0, -10)}
                >
                  <ArrowUp aria-hidden="true" />
                  上移 10
                </button>
                <button
                  type="button"
                  disabled={!hasScope}
                  aria-label="向下移动 10 px"
                  onClick={() => onNudge(0, 10)}
                >
                  <ArrowDown aria-hidden="true" />
                  下移 10
                </button>
              </div>
              <div className="nudge-grid">
                <button
                  type="button"
                  disabled={!hasScope}
                  aria-label="向左微调 1 px"
                  onClick={() => onNudge(-1, 0)}
                >
                  X −
                </button>
                <button
                  type="button"
                  disabled={!hasScope}
                  aria-label="向右微调 1 px"
                  onClick={() => onNudge(1, 0)}
                >
                  X +
                </button>
                <button
                  type="button"
                  disabled={!hasScope}
                  aria-label="向上微调 1 px"
                  onClick={() => onNudge(0, -1)}
                >
                  Y −
                </button>
                <button
                  type="button"
                  disabled={!hasScope}
                  aria-label="向下微调 1 px"
                  onClick={() => onNudge(0, 1)}
                >
                  Y +
                </button>
              </div>
              <p className="keyboard-hint">
                方向键微调 1 px，Shift + 方向键微调 10 px。
              </p>
            </InspectorSection>
          </>
        ) : null}

        {tab === "layout" ? (
          <>
            <InspectorSection
              title="画布尺寸"
              description="应用后自动重新布局；手动移动的节点和标签按新画布比例保留。"
            >
              <div className="two-column-fields canvas-size-fields">
                <Field label="宽度">
                  <div className="numeric-suffix">
                    <input
                      type="number"
                      aria-label="画布宽度"
                      min={MIN_CANVAS_WIDTH}
                      max={MAX_CANVAS_WIDTH}
                      step="10"
                      value={canvasDraft.width}
                      onChange={(event) =>
                        setCanvasDraft((current) => ({
                          ...current,
                          width: event.target.value,
                        }))
                      }
                    />
                    <span>px</span>
                  </div>
                </Field>
                <Field label="高度">
                  <div className="numeric-suffix">
                    <input
                      type="number"
                      aria-label="画布高度"
                      min={MIN_CANVAS_HEIGHT}
                      max={MAX_CANVAS_HEIGHT}
                      step="10"
                      value={canvasDraft.height}
                      onChange={(event) =>
                        setCanvasDraft((current) => ({
                          ...current,
                          height: event.target.value,
                        }))
                      }
                    />
                    <span>px</span>
                  </div>
                </Field>
              </div>
              <p className="field-hint">
                宽度 {MIN_CANVAS_WIDTH}–{MAX_CANVAS_WIDTH} px，高度 {MIN_CANVAS_HEIGHT}–{MAX_CANVAS_HEIGHT} px。
              </p>
              <button
                type="button"
                className="primary-button"
                disabled={!canvasDraftValid || !canvasSizeChanged}
                onClick={() =>
                  onCanvasSizeChange(draftCanvasWidth, draftCanvasHeight)
                }
              >
                应用尺寸并重新布局
              </button>
            </InspectorSection>
            <InspectorSection
              title="自动布局"
              description="重新布局节点时，已手工移动的标签位置会保留。"
            >
              <Field
                label="节点横向列分配"
                hint={
                  alignmentHasVisibleEffect
                    ? "只改变节点所在的横向列，不改变上下排列。"
                    : "当前数据的路径层级一致，因此四种方式结果相同；跨层连接或提前终止节点时才会变化。"
                }
              >
                <select
                  aria-label="节点横向列分配"
                  value={settings.alignment}
                  onChange={(event) =>
                    onSettingsChange({
                      alignment: event.target.value as SankeyAlignment,
                    })
                  }
                >
                  <option value="justify">终点统一最右（两端）</option>
                  <option value="left">按来源层级靠左</option>
                  <option value="center">在上下游之间居中</option>
                  <option value="right">按终点距离靠右</option>
                </select>
              </Field>
              <div className="range-field">
                <div className="range-field__heading">
                  <span>节点宽度</span>
                  <div className="numeric-suffix">
                    <input
                      type="number"
                      min="12"
                      max="90"
                      value={settings.nodeWidth}
                      onChange={(event) =>
                        onSettingsChange({
                          nodeWidth: Number(event.target.value),
                        })
                      }
                    />
                    <span>px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="12"
                  max="90"
                  value={settings.nodeWidth}
                  onChange={(event) =>
                    onSettingsChange({
                      nodeWidth: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="range-field">
                <div className="range-field__heading">
                  <span>节点间距</span>
                  <div className="numeric-suffix">
                    <input
                      type="number"
                      min="6"
                      max="48"
                      value={settings.nodePadding}
                      onChange={(event) =>
                        onSettingsChange({
                          nodePadding: Number(event.target.value),
                        })
                      }
                    />
                    <span>px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="6"
                  max="48"
                  value={settings.nodePadding}
                  onChange={(event) =>
                    onSettingsChange({
                      nodePadding: Number(event.target.value),
                    })
                  }
                />
              </div>
            </InspectorSection>
          </>
        ) : null}

        {tab === "export" ? (
          <>
            <InspectorSection
              title="成品尺寸"
              description="像素由毫米和 DPI 自动计算；PNG 会写入真实物理分辨率。"
            >
              <div className="two-column-fields export-size-fields">
                <Field label="成品宽度">
                  <div className="numeric-suffix">
                    <input
                      type="number"
                      min="30"
                      max="500"
                      step="0.1"
                      value={exportSettings.physicalWidthMm}
                      onChange={(event) =>
                        onExportSettingsChange(
                          exportSettingsForPhysicalSize(
                            exportSettings,
                            Number(event.target.value),
                            exportSettings.dpi,
                            settings.canvasWidth,
                            settings.canvasHeight,
                          ),
                        )
                      }
                    />
                    <span>mm</span>
                  </div>
                </Field>
                <Field label="分辨率">
                  <div className="numeric-suffix">
                    <input
                      type="number"
                      min="72"
                      max="1200"
                      step="10"
                      value={exportSettings.dpi}
                      onChange={(event) =>
                        onExportSettingsChange(
                          exportSettingsForPhysicalSize(
                            exportSettings,
                            exportSettings.physicalWidthMm,
                            Number(event.target.value),
                            settings.canvasWidth,
                            settings.canvasHeight,
                          ),
                        )
                      }
                    />
                    <span>dpi</span>
                  </div>
                </Field>
              </div>
              <div className="publication-metrics" aria-label="最终输出参数">
                <span>
                  <strong>{exportSettings.width}</strong> × {exportSettings.height} px
                </span>
                <span>
                  <strong>{exportSettings.physicalWidthMm.toFixed(1)}</strong> ×{" "}
                  {publicationPreflight.physicalHeightMm.toFixed(1)} mm
                </span>
                <span>
                  标签 <strong>{publicationPreflight.effectiveLabelPt.toFixed(1)}</strong> pt
                </span>
                <span>
                  下限 <strong>{publicationPreflight.minimumTextPt.toFixed(1)}</strong> pt
                </span>
              </div>
              <Field label="背景">
                <select
                  value={exportSettings.background}
                  onChange={(event) =>
                    onExportSettingsChange({
                      background:
                        event.target.value as SankeyExportSettings["background"],
                    })
                  }
                >
                  <option value="white">白色</option>
                  <option value="transparent">透明</option>
                </select>
              </Field>
            </InspectorSection>
            <InspectorSection
              title="导出提醒"
              description="以下内容只用于提醒，不会阻止导出；请按用途自行判断。"
            >
              <div
                className={`publication-summary ${
                  publicationPreflight.warningCount > 0
                    ? "has-warnings"
                    : "is-ready"
                }`}
                role="status"
              >
                <strong>可以导出</strong>
                <span>
                  {publicationPreflight.warningCount} 条提醒 ·{" "}
                  {publicationPreflight.infoCount} 条信息
                </span>
              </div>
              <div className="publication-issues">
                {publicationPreflight.issues.map((item) => {
                  const action = publicationIssueAction(item.id);
                  return (
                    <div
                      className={`publication-issue is-${item.severity}`}
                      key={item.id}
                    >
                      <span aria-hidden="true" />
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                        {action ? (
                          <button
                            type="button"
                            className="publication-issue__action"
                            onClick={action.run}
                          >
                            {action.label}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </InspectorSection>
          </>
        ) : null}
      </div>
    </aside>
  );
}
