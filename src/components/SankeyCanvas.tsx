import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { sankeyLinkHorizontal } from "d3-sankey";
import { getPalette } from "../data/palettes";
import { getLabelFontStack } from "../data/fonts";
import type {
  LabelOverride,
  LabelPosition,
  NodeOverride,
  ProofMode,
  SankeyMetadata,
  SankeySettings,
} from "../types";
import {
  linkGroupColor,
  resolveLinkGroupColors,
  resolveNodeColors,
} from "../utils/colors";
import {
  buildLabelPositions,
  getLabelLines,
  getLeaderLineGeometry,
  shouldShowLeaderLine,
} from "../utils/labelLayout";
import {
  applyNodePositions,
  getLinkId,
  getNodeId,
  resolveNodeDragPositions,
  resolveNodeKeyboardPositions,
  type FlowLink,
  type FlowNode,
  type LayoutGraph,
  type LayoutLink,
  type LayoutNode,
} from "../utils/sankey";
import { buildPercentageSummary } from "../utils/percentages";
import {
  buildCanvasViewport,
  clampCanvasZoom,
} from "../utils/canvasViewport";

interface GuideState {
  x?: number;
  y?: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  primaryId: string;
  ids: string[];
  initial: Record<string, { x: number; y: number }>;
}

interface NodeDragState {
  pointerId: number;
  id: string;
  startPointerY: number;
  initialY: number;
}

interface SankeyCanvasProps {
  graph: LayoutGraph | null;
  error: string | null;
  settings: SankeySettings;
  metadata: SankeyMetadata;
  nodeColors: Record<string, string>;
  labelOverrides: Record<string, LabelOverride>;
  labelTextOverrides: Record<string, string>;
  labelColorOverrides: Record<string, string>;
  selectedIds: Set<string>;
  proofMode: ProofMode;
  zoom: number;
  panX: number;
  panY: number;
  svgRef: RefObject<SVGSVGElement | null>;
  onSelectionChange: (ids: string[]) => void;
  onLabelPositionsChange: (
    positions: Record<string, Pick<LabelOverride, "x" | "y">>,
  ) => void;
  onNodePositionsChange: (positions: Record<string, NodeOverride>) => void;
  onKeyboardNudge: (ids: string[], dx: number, dy: number) => void;
  onGeometryChange: (positions: LabelPosition[]) => void;
  onZoomChange: (zoom: number) => void;
  onViewportCapabilitiesChange: (capabilities: {
    canPanX: boolean;
    canPanY: boolean;
  }) => void;
}

function pointInSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: clientX, y: clientY };
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

function labelLines(
  node: LayoutNode,
  settings: SankeySettings,
  percentage: number,
  unit: string,
  customText?: string,
): string[] {
  const id = getNodeId(node);
  const value = Number(node.value ?? 0);
  return getLabelLines(
    { id, name: id, value, percent: percentage },
    settings.labelMode,
    customText,
    unit,
    settings.valueDecimals,
  );
}

export function SankeyCanvas({
  graph,
  error,
  settings,
  metadata,
  nodeColors,
  labelOverrides,
  labelTextOverrides,
  labelColorOverrides,
  selectedIds,
  proofMode,
  zoom,
  panX,
  panY,
  svgRef,
  onSelectionChange,
  onLabelPositionsChange,
  onNodePositionsChange,
  onKeyboardNudge,
  onGeometryChange,
  onZoomChange,
  onViewportCapabilitiesChange,
}: SankeyCanvasProps) {
  const dragRef = useRef<DragState | null>(null);
  const [preview, setPreview] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const previewRef = useRef<Record<string, { x: number; y: number }>>({});
  const [guides, setGuides] = useState<GuideState>({});
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null);
  const nodeDragRef = useRef<NodeDragState | null>(null);
  const [nodePreview, setNodePreview] = useState<Record<string, NodeOverride>>({});
  const nodePreviewRef = useRef<Record<string, NodeOverride>>({});
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [fontMeasurementVersion, setFontMeasurementVersion] = useState(0);
  const [viewportSize, setViewportSize] = useState({
    width: settings.canvasWidth,
    height: settings.canvasHeight,
  });
  const displayGraph = useMemo(() => {
    if (!graph || Object.keys(nodePreview).length === 0) return graph;
    const previewGraph = structuredClone(graph) as LayoutGraph;
    return applyNodePositions(
      previewGraph,
      nodePreview,
      settings.canvasHeight,
      settings.nodePadding,
    );
  }, [graph, nodePreview, settings.canvasHeight, settings.nodePadding]);
  const palette = getPalette(settings.paletteId);
  const colors = useMemo(
    () =>
      resolveNodeColors(
        displayGraph,
        palette.colors,
        nodeColors,
        settings.nodeColorMode,
        settings.nodeBaseColor,
      ),
    [
      displayGraph,
      nodeColors,
      palette.colors,
      settings.nodeBaseColor,
      settings.nodeColorMode,
    ],
  );
  const linkGroupColors = useMemo(
    () => resolveLinkGroupColors(displayGraph, palette.colors),
    [displayGraph, palette.colors],
  );
  const percentageSummary = useMemo(
    () => buildPercentageSummary(displayGraph, settings),
    [displayGraph, settings],
  );
  const labelPositions = useMemo(
    () =>
      buildLabelPositions(
        displayGraph,
        settings.labelMode,
        settings.labelPlacement,
        settings.fontSize,
        settings.fontWeight,
        settings.fontStyle,
        settings.fontFamily,
        labelOverrides,
        labelTextOverrides,
        percentageSummary.byNode,
        metadata.unit,
        settings.valueDecimals,
        settings.canvasWidth,
        settings.canvasHeight,
      ),
    [
      displayGraph,
      labelOverrides,
      labelTextOverrides,
      metadata.unit,
      percentageSummary.byNode,
      fontMeasurementVersion,
      settings.fontFamily,
      settings.fontSize,
      settings.fontStyle,
      settings.fontWeight,
      settings.canvasHeight,
      settings.canvasWidth,
      settings.labelMode,
      settings.labelPlacement,
      settings.valueDecimals,
    ],
  );
  const positionById = useMemo(
    () => new Map(labelPositions.map((position) => [position.id, position])),
    [labelPositions],
  );
  const automaticLabelPositions = useMemo(
    () =>
      buildLabelPositions(
        displayGraph,
        settings.labelMode,
        settings.labelPlacement,
        settings.fontSize,
        settings.fontWeight,
        settings.fontStyle,
        settings.fontFamily,
        {},
        labelTextOverrides,
        percentageSummary.byNode,
        metadata.unit,
        settings.valueDecimals,
        settings.canvasWidth,
        settings.canvasHeight,
      ),
    [
      displayGraph,
      labelTextOverrides,
      metadata.unit,
      percentageSummary.byNode,
      fontMeasurementVersion,
      settings.fontFamily,
      settings.fontSize,
      settings.fontStyle,
      settings.fontWeight,
      settings.canvasHeight,
      settings.canvasWidth,
      settings.labelMode,
      settings.labelPlacement,
      settings.valueDecimals,
    ],
  );
  const automaticPositionById = useMemo(
    () =>
      new Map(
        automaticLabelPositions.map((position) => [position.id, position]),
      ),
    [automaticLabelPositions],
  );
  useEffect(() => onGeometryChange(labelPositions), [
    labelPositions,
    onGeometryChange,
  ]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => {
      const bounds = svg.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      setViewportSize((current) =>
        Math.abs(current.width - bounds.width) < 0.5 &&
        Math.abs(current.height - bounds.height) < 0.5
          ? current
          : { width: bounds.width, height: bounds.height },
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef]);

  useEffect(() => {
    let active = true;
    void window.document.fonts?.ready.then(() => {
      if (active) setFontMeasurementVersion((value) => value + 1);
    });
    return () => {
      active = false;
    };
  }, [settings.fontFamily, settings.fontStyle, settings.fontWeight]);

  const viewport = useMemo(
    () =>
      buildCanvasViewport(
        viewportSize.width,
        viewportSize.height,
        zoom,
        panX,
        panY,
        settings.canvasWidth,
        settings.canvasHeight,
      ),
    [
      panX,
      panY,
      settings.canvasHeight,
      settings.canvasWidth,
      viewportSize.height,
      viewportSize.width,
      zoom,
    ],
  );
  useEffect(
    () =>
      onViewportCapabilitiesChange({
        canPanX: viewport.canPanX,
        canPanY: viewport.canPanY,
      }),
    [
      onViewportCapabilitiesChange,
      viewport.canPanX,
      viewport.canPanY,
    ],
  );

  const startLabelDrag = (
    event: ReactPointerEvent<SVGGElement>,
    id: string,
  ) => {
    event.stopPropagation();
    setActiveNodeId(null);
    const isMulti = event.shiftKey || event.metaKey || event.ctrlKey;
    const currentSelection = [...selectedIds];
    let nextSelection: string[];

    if (isMulti && selectedIds.has(id)) {
      nextSelection = currentSelection.filter((selectedId) => selectedId !== id);
      onSelectionChange(nextSelection);
      return;
    }
    if (isMulti) {
      nextSelection = [...currentSelection, id];
    } else if (selectedIds.has(id)) {
      nextSelection = currentSelection;
    } else {
      nextSelection = [id];
    }
    onSelectionChange(nextSelection);

    const svg = svgRef.current;
    const item = positionById.get(id);
    if (!svg || !item || item.locked) return;

    const start = pointInSvg(svg, event.clientX, event.clientY);
    const initial = Object.fromEntries(
      nextSelection
        .map((selectedId) => positionById.get(selectedId))
        .filter((position): position is LabelPosition => Boolean(position))
        .filter((position) => !position.locked)
        .map((position) => [
          position.id,
          { x: position.x, y: position.y },
        ]),
    );
    if (Object.keys(initial).length === 0) return;

    const nextDrag = {
      pointerId: event.pointerId,
      startX: start.x,
      startY: start.y,
      primaryId: id,
      ids: Object.keys(initial),
      initial,
    };
    dragRef.current = nextDrag;
  };

  const moveLabelDrag = (event: ReactPointerEvent<SVGElement>) => {
    const currentDrag = dragRef.current;
    if (
      !currentDrag ||
      currentDrag.pointerId !== event.pointerId ||
      !svgRef.current
    ) {
      return;
    }
    const point = pointInSvg(svgRef.current, event.clientX, event.clientY);
    let dx = point.x - currentDrag.startX;
    let dy = point.y - currentDrag.startY;
    const primary = currentDrag.initial[currentDrag.primaryId];
    const matrix = svgRef.current.getScreenCTM();
    const threshold = 7 / Math.max(Math.abs(matrix?.a ?? 1), 0.001);
    const staticLabels = labelPositions.filter(
      (position) => !currentDrag.ids.includes(position.id),
    );
    const xCandidates = [
      settings.canvasWidth / 2,
      ...staticLabels.map((position) => position.x),
    ];
    const yCandidates = [
      settings.canvasHeight / 2,
      ...staticLabels.map((position) => position.y),
    ];

    const desiredX = primary.x + dx;
    const desiredY = primary.y + dy;
    const nearestX = xCandidates.reduce(
      (best, candidate) =>
        Math.abs(candidate - desiredX) < Math.abs(best - desiredX)
          ? candidate
          : best,
      xCandidates[0],
    );
    const nearestY = yCandidates.reduce(
      (best, candidate) =>
        Math.abs(candidate - desiredY) < Math.abs(best - desiredY)
          ? candidate
          : best,
      yCandidates[0],
    );

    const nextGuides: GuideState = {};
    if (Math.abs(nearestX - desiredX) <= threshold) {
      dx += nearestX - desiredX;
      nextGuides.x = nearestX;
    }
    if (Math.abs(nearestY - desiredY) <= threshold) {
      dy += nearestY - desiredY;
      nextGuides.y = nearestY;
    }

    setGuides(nextGuides);
    const nextPreview = Object.fromEntries(
      currentDrag.ids.map((id) => [
          id,
          {
            x: currentDrag.initial[id].x + dx,
            y: currentDrag.initial[id].y + dy,
          },
        ]),
    );
    previewRef.current = nextPreview;
    setPreview(nextPreview);
  };

  const finishLabelDrag = (event: ReactPointerEvent<SVGElement>) => {
    const currentDrag = dragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
    if (Object.keys(previewRef.current).length > 0) {
      onLabelPositionsChange(previewRef.current);
    }
    dragRef.current = null;
    previewRef.current = {};
    setPreview({});
    setGuides({});
  };

  const cancelLabelDrag = (event: ReactPointerEvent<SVGElement>) => {
    const currentDrag = dragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    previewRef.current = {};
    setPreview({});
    setGuides({});
  };

  const updateNodePreview = (preview: Record<string, NodeOverride>) => {
    nodePreviewRef.current = preview;
    setNodePreview(preview);
  };

  const startNodeDrag = (
    event: ReactPointerEvent<SVGElement>,
    node: LayoutNode,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (
      !svgRef.current ||
      !graph ||
      node.y0 === undefined ||
      node.y1 === undefined
    ) {
      return;
    }

    const id = getNodeId(node);
    const pointer = pointInSvg(svgRef.current, event.clientX, event.clientY);
    onSelectionChange([]);
    setActiveNodeId(id);
    const nextDrag = {
      pointerId: event.pointerId,
      id,
      startPointerY: pointer.y,
      initialY: node.y0,
    };
    nodeDragRef.current = nextDrag;
    setNodeDrag(nextDrag);
    updateNodePreview(
      resolveNodeDragPositions(
        graph,
        id,
        node.y0,
        settings.canvasHeight,
        settings.nodePadding,
      ),
    );
  };

  const moveNodeDrag = (event: ReactPointerEvent<SVGElement>) => {
    const currentDrag = nodeDragRef.current;
    if (
      !currentDrag ||
      currentDrag.pointerId !== event.pointerId ||
      !svgRef.current ||
      !graph
    ) {
      return;
    }
    const pointer = pointInSvg(svgRef.current, event.clientX, event.clientY);
    const requestedY =
      currentDrag.initialY + pointer.y - currentDrag.startPointerY;
    updateNodePreview(
      resolveNodeDragPositions(
        graph,
        currentDrag.id,
        requestedY,
        settings.canvasHeight,
        settings.nodePadding,
      ),
    );
  };

  const finishNodeDrag = (event: ReactPointerEvent<SVGElement>) => {
    const currentDrag = nodeDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
    const preview = nodePreviewRef.current;
    const targetPreview = preview[currentDrag.id];
    if (
      targetPreview &&
      Math.abs(targetPreview.y - currentDrag.initialY) >= 0.5
    ) {
      onNodePositionsChange(preview);
    }
    nodeDragRef.current = null;
    setNodeDrag(null);
    updateNodePreview({});
  };

  const cancelNodeDrag = (event: ReactPointerEvent<SVGElement>) => {
    const currentDrag = nodeDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
    nodeDragRef.current = null;
    setNodeDrag(null);
    updateNodePreview({});
  };

  if (error || !displayGraph) {
    return (
      <div className="canvas-empty" role="alert">
        <div className="canvas-empty__mark">!</div>
        <h2>暂时无法绘制桑基图</h2>
        <p>{error ?? "请检查数据表。"}</p>
      </div>
    );
  }

  const linkPath = sankeyLinkHorizontal<FlowNode, FlowLink>();

  return (
    <svg
      ref={svgRef}
      className={`sankey-svg proof-${proofMode}`}
      viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="可交互桑基图。色块可上下拖动，标签可独立拖拽，Shift 可多选。"
      onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const factor = event.deltaY > 0 ? 0.9 : 1.1;
        onZoomChange(clampCanvasZoom(zoom * factor));
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onSelectionChange([]);
          setActiveNodeId(null);
        }
      }}
      onPointerMove={(event) => {
        moveLabelDrag(event);
        moveNodeDrag(event);
      }}
      onPointerUp={(event) => {
        finishLabelDrag(event);
        finishNodeDrag(event);
      }}
      onPointerCancel={(event) => {
        cancelLabelDrag(event);
        cancelNodeDrag(event);
      }}
    >
      <defs>
        <filter id="sankey-proof-protanopia" data-export-ignore="true">
          <feColorMatrix
            type="matrix"
            values="0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0"
          />
        </filter>
        <filter id="sankey-proof-deuteranopia" data-export-ignore="true">
          <feColorMatrix
            type="matrix"
            values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"
          />
        </filter>
        {displayGraph.links.map((rawLink) => {
          const link = rawLink as LayoutLink;
          const source = link.source as LayoutNode;
          const target = link.target as LayoutNode;
          const id = getLinkId(link).replace(/[^\w-]/g, "-");
          return (
            <linearGradient
              key={id}
              id={`link-gradient-${id}`}
              gradientUnits="userSpaceOnUse"
              x1={source.x1 ?? 0}
              x2={target.x0 ?? 0}
              y1="0"
              y2="0"
            >
              <stop
                offset="0%"
                stopColor={colors.get(getNodeId(source)) ?? "#94A3B8"}
              />
              <stop
                offset="100%"
                stopColor={colors.get(getNodeId(target)) ?? "#94A3B8"}
              />
            </linearGradient>
          );
        })}
      </defs>

      <g className="sankey-links" fill="none">
        {displayGraph.links.map((rawLink) => {
          const link = rawLink as LayoutLink;
          const source = link.source as LayoutNode;
          const target = link.target as LayoutNode;
          const sourceColor = colors.get(getNodeId(source)) ?? "#94A3B8";
          const targetColor = colors.get(getNodeId(target)) ?? "#94A3B8";
          const id = getLinkId(link).replace(/[^\w-]/g, "-");
          const stroke =
            settings.linkColorMode === "source"
              ? sourceColor
              : settings.linkColorMode === "target"
                ? targetColor
                : settings.linkColorMode === "gradient"
                  ? `url(#link-gradient-${id})`
                  : settings.linkColorMode === "group"
                    ? linkGroupColor(link, linkGroupColors)
                  : "#64748B";
          return (
            <path
              key={getLinkId(link)}
              d={linkPath(link) ?? undefined}
              stroke={stroke}
              strokeOpacity={settings.linkOpacity}
              strokeWidth={Math.max(0, Number(link.width ?? 0))}
              strokeLinecap="butt"
            >
              <title>{`${getNodeId(source)} → ${getNodeId(target)}：${Number(
                link.value ?? 0,
              ).toLocaleString("zh-CN")}${metadata.unit ? ` ${metadata.unit}` : ""}`}</title>
            </path>
          );
        })}
      </g>

      <g className="sankey-nodes">
        {displayGraph.nodes.map((node) => {
          const id = getNodeId(node);
          const fill = colors.get(id) ?? "#64748B";
          const isDragging = nodeDrag?.id === id;
          const x0 = node.x0 ?? 0;
          const x1 = node.x1 ?? 0;
          const y0 = node.y0 ?? 0;
          const y1 = node.y1 ?? 0;
          return (
            <g key={id}>
              <line
                className="sankey-node-hit"
                data-export-ignore="true"
                x1={(x0 + x1) / 2}
                x2={(x0 + x1) / 2}
                y1={y0}
                y2={y1}
                stroke="#000000"
                strokeOpacity="0"
                strokeWidth="44"
                strokeLinecap="butt"
                vectorEffect="non-scaling-stroke"
                pointerEvents="stroke"
                aria-hidden="true"
                focusable="false"
                onPointerDown={(event) => startNodeDrag(event, node)}
              />
              <rect
                className={`sankey-node ${isDragging ? "is-dragging" : ""}`}
                x={x0}
                y={y0}
                width={x1 - x0}
                height={Math.max(0, y1 - y0)}
                fill={fill}
                fillOpacity="0.92"
                stroke="none"
                strokeWidth="0"
                rx="2"
                vectorEffect="non-scaling-stroke"
                shapeRendering="geometricPrecision"
                role="button"
                tabIndex={0}
                aria-pressed={activeNodeId === id}
                aria-label={`${id} 节点色块，可上下拖动`}
                onFocus={() => setActiveNodeId(id)}
                onPointerDown={(event) => startNodeDrag(event, node)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectionChange([]);
                    setActiveNodeId(id);
                    return;
                  }
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                  event.preventDefault();
                  event.stopPropagation();
                  const step = event.shiftKey ? 10 : 1;
                  const direction = event.key === "ArrowUp" ? -step : step;
                  const positions = resolveNodeKeyboardPositions(
                    displayGraph,
                    id,
                    direction,
                    settings.canvasHeight,
                    settings.nodePadding,
                  );
                  onSelectionChange([]);
                  setActiveNodeId(id);
                  if (
                    positions[id] &&
                    Math.abs(positions[id].y - y0) >= 0.5
                  ) {
                    onNodePositionsChange(positions);
                  }
                }}
              >
              <title>{`${id}：${Number(node.value ?? 0).toLocaleString(
                  "zh-CN",
                )}${metadata.unit ? ` ${metadata.unit}` : ""}`}</title>
              </rect>
              {activeNodeId === id ? (
                <rect
                  data-export-ignore="true"
                  x={x0}
                  y={y0}
                  width={x1 - x0}
                  height={Math.max(0, y1 - y0)}
                  fill="none"
                  stroke="#0B6BFF"
                  strokeWidth="2.25"
                  rx="2"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              ) : null}
            </g>
          );
        })}
      </g>

      <g className="leader-lines">
        {displayGraph.nodes.map((node) => {
          const id = getNodeId(node);
          const base = positionById.get(id);
          if (!base) return null;
          const isManuallyPositioned = Boolean(labelOverrides[id] || preview[id]);
          const position = preview[id] ? { ...base, ...preview[id] } : base;
          if (
            !shouldShowLeaderLine(
              position,
              automaticPositionById.get(id),
              isManuallyPositioned,
              settings.showLeaderLines,
              settings.leaderLineThresholdPx,
            )
          ) {
            return null;
          }
          const line = getLeaderLineGeometry(node, position);
          if (!line) return null;
          return (
            <line
              key={id}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#64748B"
              strokeWidth="1"
              strokeOpacity="0.72"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>

      <g className="label-layer">
        {displayGraph.nodes.map((node) => {
          const id = getNodeId(node);
          const base = positionById.get(id);
          if (!base) return null;
          const position = preview[id] ?? base;
          const labelColor = labelColorOverrides[id] ?? settings.fontColor;
          const lines = labelLines(
            node,
            settings,
            percentageSummary.byNode[id] ?? 0,
            metadata.unit,
            labelTextOverrides[id],
          );
          const isSelected = selectedIds.has(id);
          const lineHeight = settings.fontSize * 1.18;
          const textStart = -((lines.length - 1) * lineHeight) / 2;

          return (
            <g
              key={id}
              className={`sankey-label ${isSelected ? "is-selected" : ""} ${
                base.locked ? "is-locked" : ""
              }`}
              transform={`translate(${position.x}, ${position.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${id} 标签${base.locked ? "，已锁定" : ""}`}
              onFocus={() => setActiveNodeId(null)}
              onPointerDown={(event) => startLabelDrag(event, id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (!selectedIds.has(id)) onSelectionChange([id]);
                  return;
                }
                const step = event.shiftKey ? 10 : 1;
                const directions: Record<string, [number, number]> = {
                  ArrowLeft: [-step, 0],
                  ArrowRight: [step, 0],
                  ArrowUp: [0, -step],
                  ArrowDown: [0, step],
                };
                const direction = directions[event.key];
                if (!direction || base.locked) return;
                event.preventDefault();
                if (!selectedIds.has(id)) onSelectionChange([id]);
                onKeyboardNudge(
                  selectedIds.has(id) ? [...selectedIds] : [id],
                  direction[0],
                  direction[1],
                );
              }}
            >
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill={labelColor}
                fontSize={settings.fontSize}
                pointerEvents="all"
                style={{
                  fontFamily: getLabelFontStack(settings.fontFamily),
                  fontStyle: settings.fontStyle,
                  fontWeight: settings.fontWeight,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {lines.map((line, index) => (
                  <tspan
                    key={`${id}-${index}`}
                    x="0"
                    y={textStart + index * lineHeight}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
              {isSelected ? (
                <g data-export-ignore="true" pointerEvents="none">
                  <rect
                    x={-base.width / 2}
                    y={-base.height / 2}
                    width={base.width}
                    height={base.height}
                    fill="none"
                    stroke="#0B6BFF"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {[
                    [-base.width / 2, -base.height / 2],
                    [base.width / 2, -base.height / 2],
                    [-base.width / 2, base.height / 2],
                    [base.width / 2, base.height / 2],
                  ].map(([x, y], index) => (
                    <rect
                      key={index}
                      x={x - 3}
                      y={y - 3}
                      width="6"
                      height="6"
                      fill="#FFFFFF"
                      stroke="#0B6BFF"
                      strokeWidth="1.25"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              ) : null}
            </g>
          );
        })}
      </g>

      <g
        className="alignment-guides"
        data-export-ignore="true"
        pointerEvents="none"
      >
        {guides.x !== undefined ? (
          <line
            x1={guides.x}
            x2={guides.x}
            y1="24"
            y2={settings.canvasHeight - 24}
            stroke="#06B6D4"
            strokeWidth="1"
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {guides.y !== undefined ? (
          <line
            x1="24"
            x2={settings.canvasWidth - 24}
            y1={guides.y}
            y2={guides.y}
            stroke="#06B6D4"
            strokeWidth="1"
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </g>
    </svg>
  );
}
