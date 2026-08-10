import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";
import { DataPanel, type DataPanelTab } from "./components/DataPanel";
import { Inspector } from "./components/Inspector";
import { SankeyCanvas } from "./components/SankeyCanvas";
import { Toolbar } from "./components/Toolbar";
import { IconButton } from "./components/ui";
import { getPalette } from "./data/palettes";
import { useSankeyDocument } from "./hooks/useSankeyDocument";
import type {
  AlignOperation,
  LabelOperationScope,
  LabelPosition,
  LabelScopeOption,
  ProofMode,
} from "./types";
import {
  downloadCsv,
  downloadDocument,
  downloadPng,
  downloadPublicationManifest,
  downloadSvg,
  downloadTiff,
  printFigure,
} from "./utils/export";
import { alignLabels, countLabelOverlaps } from "./utils/labelLayout";
import {
  resolveNodeColors,
  summarizeLinkGroupColorMapping,
  summarizeNodeColorMapping,
} from "./utils/colors";
import { buildPercentageSummary } from "./utils/percentages";
import { analyzeSankeyData } from "./utils/quality";
import {
  CANVAS_ZOOM_STEP,
  clampCanvasZoom,
  clampCanvasHeight,
  clampCanvasWidth,
  getInitialCanvasZoom,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
} from "./utils/canvasViewport";
import { buildPublicationPreflight } from "./utils/publication";
import {
  applyNodePositions,
  buildSankeyLayout,
  getSankeyColumns,
  sankeyAlignmentsHaveVisibleEffect,
} from "./utils/sankey";

type MobilePanel = "none" | "data" | "inspector";

interface LabelScopeOptionWithIds extends LabelScopeOption {
  ids: string[];
}

export default function App() {
  const {
    document,
    selection,
    selectedLabelIds,
    canUndo,
    canRedo,
    undo,
    redo,
    setRows,
    setTitle,
    updateRow,
    addRow,
    removeRow,
    setSettings,
    setCanvasSize,
    setMetadata,
    setExportSettings,
    setNodeColor,
    setLabelPositions,
    setLabelText,
    setLabelColor,
    setNodePositions,
    nudgeLabels,
    toggleLabelLocks,
    resetLabels,
    loadDocument,
    setSelectedLabelIds,
  } = useSankeyDocument();
  const [labelGeometry, setLabelGeometry] = useState<LabelPosition[]>([]);
  const [zoom, setZoom] = useState(() =>
    typeof window === "undefined"
      ? 1
      : getInitialCanvasZoom(window.innerWidth, window.innerHeight),
  );
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewportCapabilities, setViewportCapabilities] = useState({
    canPanX: false,
    canPanY: false,
  });
  const [mobilePanel, setMobilePanel] =
    useState<MobilePanel>("none");
  const [dataPanelTab, setDataPanelTab] = useState<DataPanelTab>("data");
  const [labelScope, setLabelScope] =
    useState<LabelOperationScope>("selection");
  const [statusMessage, setStatusMessage] = useState("所有更改已自动保存");
  const [proofMode, setProofMode] = useState<ProofMode>("normal");
  const svgRef = useRef<SVGSVGElement>(null);

  const handleZoomChange = useCallback((value: number) => {
    const nextZoom = clampCanvasZoom(value);
    setZoom(nextZoom);
    if (nextZoom <= 1) setPan({ x: 0, y: 0 });
  }, []);
  const fitCanvas = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const qualityReport = useMemo(
    () => analyzeSankeyData(document.rows),
    [document.rows],
  );

  const layout = useMemo(() => {
    if (qualityReport.errorCount > 0) {
      return {
        graph: null,
        error: "数据存在阻断性问题，请打开左侧“检查”面板处理。",
      };
    }
    const result = buildSankeyLayout(
      document.rows,
      document.settings,
      document.settings.canvasWidth,
      document.settings.canvasHeight,
    );
    if (result.graph) {
      applyNodePositions(
        result.graph,
        document.nodeOverrides,
        document.settings.canvasHeight,
        document.settings.nodePadding,
      );
    }
    return result;
  }, [
    document.nodeOverrides,
    document.rows,
    document.settings,
    qualityReport.errorCount,
  ]);

  const percentageSummary = useMemo(
    () => buildPercentageSummary(layout.graph, document.settings),
    [document.settings, layout.graph],
  );
  const resolvedNodeColors = useMemo(
    () =>
      resolveNodeColors(
        layout.graph,
        getPalette(document.settings.paletteId).colors,
        document.nodeColors,
        document.settings.nodeColorMode,
        document.settings.nodeBaseColor,
      ),
    [
      document.nodeColors,
      document.settings.nodeBaseColor,
      document.settings.nodeColorMode,
      document.settings.paletteId,
      layout.graph,
    ],
  );
  const colorMappingSummary = useMemo(() => {
    const palette = getPalette(document.settings.paletteId);
    return summarizeNodeColorMapping(
      layout.graph,
      document.settings.nodeColorMode,
      palette.colors.length,
    );
  }, [document.settings.nodeColorMode, document.settings.paletteId, layout.graph]);
  const linkColorMappingSummary = useMemo(() => {
    const palette = getPalette(document.settings.paletteId);
    return summarizeLinkGroupColorMapping(layout.graph, palette.colors.length);
  }, [document.settings.paletteId, layout.graph]);
  const nodeColorEntries = useMemo(() => {
    const colors = resolvedNodeColors;
    return (layout.graph?.nodes ?? []).map((node) => {
      const id = String(node.id);
      return {
        id,
        color: colors.get(id) ?? "#64748B",
        isCustom: Boolean(document.nodeColors[id]),
      };
    });
  }, [document.nodeColors, layout.graph, resolvedNodeColors]);

  const publicationPreflight = useMemo(
    () =>
      buildPublicationPreflight({
        document,
        qualityReport,
        labels: labelGeometry,
        graph: layout.graph,
        colors: resolvedNodeColors,
      }),
    [document, labelGeometry, layout.graph, qualityReport, resolvedNodeColors],
  );
  const geometryById = useMemo(
    () => new Map(labelGeometry.map((item) => [item.id, item])),
    [labelGeometry],
  );
  const selectedGeometry = useMemo(
    () =>
      selectedLabelIds
        .map((id) => geometryById.get(id))
        .filter((item): item is LabelPosition => Boolean(item)),
    [geometryById, selectedLabelIds],
  );
  const labelColumns = useMemo(
    () => getSankeyColumns(layout.graph),
    [layout.graph],
  );
  const alignmentHasVisibleEffect = useMemo(
    () => sankeyAlignmentsHaveVisibleEffect(layout.graph),
    [layout.graph],
  );
  const labelScopeOptions = useMemo<LabelScopeOptionWithIds[]>(() => {
    const allIds = labelGeometry.map((item) => item.id);
    const availableIds = new Set(allIds);
    return [
      {
        value: "selection",
        label: `当前选择（${selectedLabelIds.length}）`,
        count: selectedLabelIds.length,
        ids: selectedLabelIds,
      },
      {
        value: "all",
        label: `全部标签（${allIds.length}）`,
        count: allIds.length,
        ids: allIds,
      },
      ...labelColumns.map((column) => {
        const ids = column.nodeIds.filter((id) => availableIds.has(id));
        const preview = ids.slice(0, 2).join("、");
        return {
          value: `column:${column.index}` as LabelOperationScope,
          label: `第 ${column.index + 1} 列（${ids.length}）${
            preview ? ` · ${preview}` : ""
          }`,
          count: ids.length,
          ids,
        };
      }),
    ];
  }, [labelColumns, labelGeometry, selectedLabelIds]);
  const activeLabelScope =
    labelScopeOptions.find((option) => option.value === labelScope) ??
    labelScopeOptions[0];
  const scopedLabelIds = activeLabelScope?.ids ?? [];
  const scopedGeometry = useMemo(
    () =>
      scopedLabelIds
        .map((id) => geometryById.get(id))
        .filter((item): item is LabelPosition => Boolean(item)),
    [geometryById, scopedLabelIds],
  );
  const allScopedLocked =
    scopedGeometry.length > 0 &&
    scopedGeometry.every((item) => item.locked);
  const overlapCount = useMemo(
    () => countLabelOverlaps(labelGeometry),
    [labelGeometry],
  );

  const currentPositionMap = useCallback(
    (ids: string[]) =>
      Object.fromEntries(
        ids
          .map((id) => geometryById.get(id))
          .filter((item): item is LabelPosition => Boolean(item))
          .map((item) => [item.id, { x: item.x, y: item.y }]),
      ),
    [geometryById],
  );

  const handleAlign = useCallback(
    (operation: AlignOperation) => {
      if (scopedGeometry.length < 2) return;
      setLabelPositions(alignLabels(scopedGeometry, operation));
      setStatusMessage(`已对齐 ${scopedGeometry.length} 个标签`);
    },
    [scopedGeometry, setLabelPositions],
  );

  const handleNudge = useCallback(
    (ids: string[], dx: number, dy: number) => {
      const movableIds = ids.filter((id) => !geometryById.get(id)?.locked);
      if (movableIds.length === 0) return;
      nudgeLabels(currentPositionMap(movableIds), dx, dy);
    },
    [currentPositionMap, geometryById, nudgeLabels],
  );

  const handleToggleLock = useCallback(() => {
    toggleLabelLocks(
      scopedLabelIds,
      currentPositionMap(scopedLabelIds),
    );
  }, [currentPositionMap, scopedLabelIds, toggleLabelLocks]);

  const handleLabelScopeChange = useCallback(
    (scope: LabelOperationScope) => {
      setLabelScope(scope);
      if (scope === "selection") return;
      const option = labelScopeOptions.find((item) => item.value === scope);
      if (option) setSelectedLabelIds(option.ids);
    },
    [labelScopeOptions, setSelectedLabelIds],
  );

  const handleScopedNudge = useCallback(
    (dx: number, dy: number) => {
      handleNudge(scopedLabelIds, dx, dy);
      const horizontal = dx < 0 ? "左移" : dx > 0 ? "右移" : "";
      const vertical = dy < 0 ? "上移" : dy > 0 ? "下移" : "";
      setStatusMessage(
        `${scopedGeometry.length} 个标签已${horizontal || vertical} ${Math.abs(
          dx || dy,
        )} px`,
      );
    },
    [handleNudge, scopedGeometry.length, scopedLabelIds],
  );

  const exportCurrent = useCallback(
    async (type: "svg" | "png" | "tiff" | "csv" | "print" | "manifest") => {
      if (type === "csv") {
        downloadCsv(document);
        setStatusMessage("CSV 数据已导出");
        return;
      }
      if (type === "manifest") {
        await downloadPublicationManifest(
          document,
          publicationPreflight,
          percentageSummary.denominatorLabel,
        );
        setStatusMessage("发表清单已导出，包含数据与设置 SHA-256");
        return;
      }
      if (!svgRef.current) {
        setStatusMessage("当前没有可导出的图形");
        return;
      }
      if (type === "svg") {
        downloadSvg(svgRef.current, document);
        setStatusMessage("SVG 矢量图已导出");
      } else if (type === "png") {
        await downloadPng(svgRef.current, document);
        setStatusMessage("PNG 图片已导出");
      } else if (type === "tiff") {
        await downloadTiff(svgRef.current, document);
        setStatusMessage("TIFF 图片已导出");
      } else {
        printFigure(svgRef.current, document);
        setStatusMessage("已打开打印 / PDF 窗口");
      }
    },
    [
      document,
      percentageSummary.denominatorLabel,
      publicationPreflight,
    ],
  );

  const handleCanvasSizeChange = useCallback(
    (width: number, height: number) => {
      const canvasWidth = clampCanvasWidth(width);
      const canvasHeight = clampCanvasHeight(height);
      setCanvasSize(canvasWidth, canvasHeight);
      fitCanvas();
      setStatusMessage(`画布已调整为 ${canvasWidth} × ${canvasHeight} px`);
    },
    [fitCanvas, setCanvasSize],
  );

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [redo, undo]);

  useEffect(() => {
    const handleCanvasZoomShortcut = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        fitCanvas();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        handleZoomChange(zoom + CANVAS_ZOOM_STEP);
      } else if (event.key === "-") {
        event.preventDefault();
        handleZoomChange(zoom - CANVAS_ZOOM_STEP);
      }
    };
    window.addEventListener("keydown", handleCanvasZoomShortcut);
    return () => window.removeEventListener("keydown", handleCanvasZoomShortcut);
  }, [fitCanvas, handleZoomChange, zoom]);

  const nodeCount = layout.graph?.nodes.length ?? 0;
  const linkCount = layout.graph?.links.length ?? 0;
  const selectedPosition =
    selectedGeometry.length === 1 ? selectedGeometry[0] : null;
  const selectedLabelId =
    selectedLabelIds.length === 1 ? selectedLabelIds[0] : null;
  const selectedLabelText = selectedLabelId
    ? (document.labelTextOverrides[selectedLabelId] ?? "")
    : "";
  const selectedLabelColor = selectedLabelId
    ? (document.labelColorOverrides[selectedLabelId] ?? document.settings.fontColor)
    : document.settings.fontColor;
  const selectedLabelHasCustomColor = Boolean(
    selectedLabelId && document.labelColorOverrides[selectedLabelId],
  );
  const denseWarning = nodeCount > 80 || linkCount > 300;

  return (
    <div className="sankey-app" data-render-ready={layout.graph ? "true" : "false"}>
      <Toolbar
        title={document.title}
        canUndo={canUndo}
        canRedo={canRedo}
        onTitleChange={setTitle}
        onUndo={undo}
        onRedo={redo}
        onSave={() => {
          downloadDocument(document);
          setStatusMessage("项目 JSON 已保存，可在“数据”面板重新导入");
        }}
        onExport={(type) => {
          void exportCurrent(type).catch((error) => {
            setStatusMessage(
              error instanceof Error ? error.message : "导出失败",
            );
          });
        }}
        onOpenData={() => setMobilePanel("data")}
        onOpenInspector={() => setMobilePanel("inspector")}
      />

      <main className="workspace">
        <DataPanel
          activeTab={dataPanelTab}
          rows={document.rows}
          metadata={document.metadata}
          qualityReport={qualityReport}
          onUpdateRow={updateRow}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          onSetRows={setRows}
          onLoadDocument={(nextDocument) => {
            setLabelScope("selection");
            loadDocument(nextDocument);
          }}
          onMetadataChange={setMetadata}
          onDownloadCsv={() => downloadCsv(document)}
          onTabChange={setDataPanelTab}
          onClose={() => setMobilePanel("none")}
          mobileOpen={mobilePanel === "data"}
        />

        <section className="canvas-workspace" aria-label="桑基图画布">
          <div className="canvas-heading">
            <div>
              <strong>{document.title}</strong>
              <span>
                {nodeCount} 个节点 · {linkCount} 条流
              </span>
            </div>
            {qualityReport.errorCount > 0 ? (
              <p>{qualityReport.errorCount} 个错误阻止绘图，请先处理。</p>
            ) : selectedLabelIds.length > 0 ? (
              <p className="canvas-selection-status">
                已选择 {selectedLabelIds.length} 个标签，可拖动或在右侧批量处理。
              </p>
            ) : overlapCount > 0 ? (
              <p>{overlapCount} 处标签重叠，可拖动或批量对齐。</p>
            ) : denseWarning ? (
              <p>数据较密集，建议减少同时显示的节点以便排版。</p>
            ) : (
              <p>上下拖拽色块；标签可独立拖拽和批量对齐。</p>
            )}
          </div>

          <div className="canvas-frame">
            <SankeyCanvas
              graph={layout.graph}
              error={layout.error}
              settings={document.settings}
              metadata={document.metadata}
              nodeColors={document.nodeColors}
              labelOverrides={document.labelOverrides}
              labelTextOverrides={document.labelTextOverrides}
              labelColorOverrides={document.labelColorOverrides}
              selectedIds={selection}
              proofMode={proofMode}
              zoom={zoom}
              panX={pan.x}
              panY={pan.y}
              svgRef={svgRef}
              onSelectionChange={(ids) => {
                setLabelScope("selection");
                setSelectedLabelIds(ids);
              }}
              onLabelPositionsChange={setLabelPositions}
              onNodePositionsChange={(positions) => {
                setNodePositions(positions);
                setStatusMessage("节点位置已更新");
              }}
              onKeyboardNudge={handleNudge}
              onGeometryChange={setLabelGeometry}
              onZoomChange={handleZoomChange}
              onViewportCapabilitiesChange={setViewportCapabilities}
            />

            <div className="canvas-zoom" data-export-ignore="true">
              <div className="canvas-pan-controls" aria-label="平移画布">
                <IconButton
                  icon={ArrowLeft}
                  label="向左查看"
                  disabled={!viewportCapabilities.canPanX}
                  onClick={() => setPan((value) => ({ ...value, x: value.x - 80 }))}
                />
                <IconButton
                  icon={ArrowUp}
                  label="向上查看"
                  disabled={!viewportCapabilities.canPanY}
                  onClick={() => setPan((value) => ({ ...value, y: value.y - 60 }))}
                />
                <IconButton
                  icon={ArrowDown}
                  label="向下查看"
                  disabled={!viewportCapabilities.canPanY}
                  onClick={() => setPan((value) => ({ ...value, y: value.y + 60 }))}
                />
                <IconButton
                  icon={ArrowRight}
                  label="向右查看"
                  disabled={!viewportCapabilities.canPanX}
                  onClick={() => setPan((value) => ({ ...value, x: value.x + 80 }))}
                />
              </div>
              <IconButton
                icon={Minus}
                label="缩小画布"
                disabled={zoom <= MIN_CANVAS_ZOOM}
                onClick={() => handleZoomChange(zoom - CANVAS_ZOOM_STEP)}
              />
              <input
                className="canvas-zoom-slider desktop-only"
                type="range"
                min={MIN_CANVAS_ZOOM * 100}
                max={MAX_CANVAS_ZOOM * 100}
                step="5"
                value={Math.round(zoom * 100)}
                aria-label="画布缩放比例"
                aria-valuetext={`${Math.round(zoom * 100)}%`}
                onChange={(event) =>
                  handleZoomChange(Number(event.target.value) / 100)
                }
              />
              <button
                type="button"
                className="zoom-value"
                title="点击适应画布；按住 Ctrl 或 Command 滚轮也可缩放"
                onClick={fitCanvas}
              >
                {Math.round(zoom * 100)}%
              </button>
              <IconButton
                icon={Plus}
                label="放大画布"
                disabled={zoom >= MAX_CANVAS_ZOOM}
                onClick={() => handleZoomChange(zoom + CANVAS_ZOOM_STEP)}
              />
              <IconButton
                icon={Maximize2}
                label="适应画布"
                onClick={fitCanvas}
              />
            </div>
          </div>
        </section>

        <Inspector
          settings={document.settings}
          exportSettings={document.exportSettings}
          percentageLabel={percentageSummary.denominatorLabel}
          publicationPreflight={publicationPreflight}
          proofMode={proofMode}
          nodeColorEntries={nodeColorEntries}
          colorMappingSummary={colorMappingSummary}
          linkColorMappingSummary={linkColorMappingSummary}
          selectedCount={selectedLabelIds.length}
          selectedLabelId={selectedLabelId}
          selectedLabelText={selectedLabelText}
          selectedLabelColor={selectedLabelColor}
          selectedLabelHasCustomColor={selectedLabelHasCustomColor}
          labelScope={activeLabelScope?.value ?? "selection"}
          labelScopeOptions={labelScopeOptions}
          scopeCount={scopedGeometry.length}
          allScopedLocked={allScopedLocked}
          alignmentHasVisibleEffect={alignmentHasVisibleEffect}
          onSettingsChange={setSettings}
          onCanvasSizeChange={handleCanvasSizeChange}
          onExportSettingsChange={setExportSettings}
          onProofModeChange={setProofMode}
          onOpenDataPanel={(tab) => {
            setDataPanelTab(tab);
            setMobilePanel("data");
          }}
          onNodeColorChange={setNodeColor}
          onAlign={handleAlign}
          onNudge={handleScopedNudge}
          onLabelTextChange={(text) => {
            if (!selectedLabelId) return;
            setLabelText(selectedLabelId, text);
            setStatusMessage(
              text.trim() ? "标签文字已更新" : "已恢复自动标签文字",
            );
          }}
          onLabelColorChange={(color) => {
            if (!selectedLabelId) return;
            setLabelColor(selectedLabelId, color);
            setStatusMessage(color ? "标签颜色已单独设置" : "已恢复全局字体颜色");
          }}
          onLabelScopeChange={handleLabelScopeChange}
          onToggleLock={handleToggleLock}
          onResetLabels={() => resetLabels(scopedLabelIds)}
          onClose={() => setMobilePanel("none")}
          mobileOpen={mobilePanel === "inspector"}
        />
      </main>

      <footer className="status-bar">
        <span>{statusMessage}</span>
        <span className="status-bar__spacer" />
        <span>已选择：{selectedLabelIds.length} 个标签</span>
        {qualityReport.warningCount > 0 ? (
          <span>数据警告：{qualityReport.warningCount}</span>
        ) : null}
        <span>
          导出提醒：{publicationPreflight.warningCount} 条
        </span>
        {selectedPosition ? (
          <span>
            X {selectedPosition.x.toFixed(1)} · Y{" "}
            {selectedPosition.y.toFixed(1)}
          </span>
        ) : null}
      </footer>
    </div>
  );
}
