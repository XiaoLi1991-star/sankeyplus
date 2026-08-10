import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_DOCUMENT,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_METADATA,
} from "../data/sampleData";
import type {
  LabelOverride,
  NodeOverride,
  SankeyDocument,
  SankeyExportSettings,
  SankeyMetadata,
  SankeyRow,
  SankeySettings,
} from "../types";
import { exportPixelSize } from "../utils/publication";
import {
  clampCanvasHeight,
  clampCanvasWidth,
} from "../utils/canvasViewport";

const STORAGE_KEY = "sankeyplus.document.v8";
const LEGACY_STORAGE_KEYS = [
  "sankeyplus.document.v7",
  "sankeyplus.document.v6",
  "sankeyplus.document.v5",
  "sankeyplus.document.v4",
  "sankeyplus.document.v3",
  "sankeyplus.document.v2",
  "sankeyplus.document.v1",
];
const HISTORY_LIMIT = 80;

interface HistoryState {
  past: SankeyDocument[];
  present: SankeyDocument;
  future: SankeyDocument[];
}

function cloneDocument(document: SankeyDocument): SankeyDocument {
  return structuredClone(document);
}

interface DocumentInput {
  schemaVersion?: number;
  title?: unknown;
  rows?: unknown;
  settings?: Partial<SankeySettings>;
  metadata?: Partial<SankeyMetadata>;
  exportSettings?: Partial<SankeyExportSettings>;
  nodeColors?: Record<string, string>;
  labelOverrides?: SankeyDocument["labelOverrides"];
  labelTextOverrides?: SankeyDocument["labelTextOverrides"];
  labelColorOverrides?: SankeyDocument["labelColorOverrides"];
  nodeOverrides?: SankeyDocument["nodeOverrides"];
}

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOptionalRecord(value: unknown, field: string): void {
  if (value !== undefined && !isRecord(value)) {
    throw new DocumentValidationError(`字段“${field}”必须是对象。`);
  }
}

function assertFiniteFields(
  value: Record<string, unknown> | undefined,
  parent: string,
  fields: string[],
): void {
  for (const field of fields) {
    const candidate = value?.[field];
    if (
      candidate !== undefined &&
      (typeof candidate !== "number" || !Number.isFinite(candidate))
    ) {
      throw new DocumentValidationError(`${parent}.${field} 必须是有限数值。`);
    }
  }
}

function assertEnumField(
  value: Record<string, unknown> | undefined,
  parent: string,
  field: string,
  options: readonly string[],
): void {
  const candidate = value?.[field];
  if (candidate !== undefined && !options.includes(String(candidate))) {
    throw new DocumentValidationError(
      `${parent}.${field} 的值“${String(candidate)}”无效。`,
    );
  }
}

function validHexMap(value: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, color]) =>
      /^#[0-9a-f]{6}$/i.test(color),
    ),
  );
}

export function normalizeDocument(document: DocumentInput): SankeyDocument {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new DocumentValidationError("JSON 根节点必须是对象。");
  }
  const schemaVersion = document.schemaVersion ?? 0;
  if (![1, 2, 3, 4, 5, 6, 7, 8].includes(schemaVersion)) {
    throw new DocumentValidationError(
      `不支持的 schemaVersion：${String(schemaVersion)}。`,
    );
  }
  assertOptionalRecord(document.settings, "settings");
  assertOptionalRecord(document.metadata, "metadata");
  assertOptionalRecord(document.exportSettings, "exportSettings");
  assertOptionalRecord(document.nodeColors, "nodeColors");
  assertOptionalRecord(document.labelOverrides, "labelOverrides");
  assertOptionalRecord(document.labelTextOverrides, "labelTextOverrides");
  assertOptionalRecord(document.labelColorOverrides, "labelColorOverrides");
  assertOptionalRecord(document.nodeOverrides, "nodeOverrides");
  if (!Array.isArray(document.rows)) {
    throw new DocumentValidationError("字段“rows”必须是数组。");
  }
  const settingsInput = document.settings as Record<string, unknown> | undefined;
  assertFiniteFields(settingsInput, "settings", [
    "linkOpacity",
    "nodeWidth",
    "nodePadding",
    "fontSize",
    "customDenominator",
    "valueDecimals",
    "canvasWidth",
    "canvasHeight",
    "leaderLineThresholdPx",
  ]);
  assertEnumField(settingsInput, "settings", "fontFamily", [
    "sans",
    "arial",
    "serif",
    "times",
    "georgia",
    "mono",
  ]);
  assertEnumField(settingsInput, "settings", "labelMode", [
    "name",
    "name-value",
    "name-percent",
    "name-value-percent",
  ]);
  assertEnumField(settingsInput, "settings", "percentageBasis", [
    "cohort",
    "column",
    "custom",
  ]);
  assertEnumField(settingsInput, "settings", "alignment", [
    "justify",
    "left",
    "right",
    "center",
  ]);
  assertEnumField(settingsInput, "settings", "paletteId", [
    "scientific-12",
    "okabe-ito",
    "viridis",
    "tol-muted",
    "colorbrewer",
  ]);
  assertEnumField(settingsInput, "settings", "nodeColorMode", [
    "single",
    "stage",
    "group",
    "individual",
  ]);
  assertEnumField(settingsInput, "settings", "linkColorMode", [
    "source",
    "target",
    "gradient",
    "group",
    "neutral",
  ]);
  assertEnumField(settingsInput, "settings", "fontStyle", ["normal", "italic"]);
  assertEnumField(settingsInput, "settings", "labelPlacement", [
    "outside",
    "inside",
  ]);
  if (
    settingsInput?.fontWeight !== undefined &&
    settingsInput.fontWeight !== 500 &&
    settingsInput.fontWeight !== 700
  ) {
    throw new DocumentValidationError("settings.fontWeight 只能是 500 或 700。");
  }
  if (
    settingsInput?.showLeaderLines !== undefined &&
    typeof settingsInput.showLeaderLines !== "boolean"
  ) {
    throw new DocumentValidationError("settings.showLeaderLines 必须是布尔值。");
  }
  const exportInput = document.exportSettings as
    | Record<string, unknown>
    | undefined;
  assertFiniteFields(exportInput, "exportSettings", [
    "width",
    "height",
    "physicalWidthMm",
    "dpi",
  ]);
  assertEnumField(exportInput, "exportSettings", "background", [
    "white",
    "transparent",
  ]);
  const settings: SankeySettings = {
    ...DEFAULT_DOCUMENT.settings,
    ...(document.settings ?? {}),
  };
  settings.canvasWidth = clampCanvasWidth(Number(settings.canvasWidth));
  settings.canvasHeight = clampCanvasHeight(Number(settings.canvasHeight));
  if (!/^#[0-9a-f]{6}$/i.test(settings.fontColor)) {
    settings.fontColor = DEFAULT_DOCUMENT.settings.fontColor;
  }
  if (!/^#[0-9a-f]{6}$/i.test(settings.nodeBaseColor)) {
    settings.nodeBaseColor = DEFAULT_DOCUMENT.settings.nodeBaseColor;
  }
  settings.customDenominator = Math.max(
    0.000001,
    Number(settings.customDenominator) || DEFAULT_DOCUMENT.settings.customDenominator,
  );
  settings.valueDecimals = Math.min(
    6,
    Math.max(0, Math.round(Number(settings.valueDecimals) || 0)),
  );
  settings.fontSize = Math.min(
    60,
    Math.max(8, Number(settings.fontSize) || DEFAULT_DOCUMENT.settings.fontSize),
  );
  settings.leaderLineThresholdPx = Math.min(
    200,
    Math.max(0, Math.round(Number(settings.leaderLineThresholdPx))),
  );
  // v4 统一使用固定全局色；不同颜色只能由用户显式设置单标签覆盖。
  settings.labelColorMode = "fixed";
  const rawExportSettings = {
    ...DEFAULT_EXPORT_SETTINGS,
    ...(document.exportSettings ?? {}),
  };
  const dpi = Math.min(
    1200,
    Math.max(72, Math.round(Number(rawExportSettings.dpi) || 300)),
  );
  const physicalWidthMm = Math.min(
    500,
    Math.max(
      30,
      Number(rawExportSettings.physicalWidthMm) ||
        ((Number(rawExportSettings.width) || DEFAULT_EXPORT_SETTINGS.width) / dpi) *
          25.4,
    ),
  );
  const exportSize = exportPixelSize(
    physicalWidthMm,
    dpi,
    settings.canvasWidth,
    settings.canvasHeight,
  );
  const rows = document.rows.map((row, index): SankeyRow => {
    if (!isRecord(row)) {
      throw new DocumentValidationError(`rows 第 ${index + 1} 行必须是对象。`);
    }
    if (typeof row.id !== "string" || !row.id.trim()) {
      throw new DocumentValidationError(`rows 第 ${index + 1} 行的 id 必须是非空字符串。`);
    }
    if (typeof row.source !== "string") {
      throw new DocumentValidationError(`rows 第 ${index + 1} 行的 source 必须是字符串。`);
    }
    if (typeof row.target !== "string") {
      throw new DocumentValidationError(`rows 第 ${index + 1} 行的 target 必须是字符串。`);
    }
    if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
      throw new DocumentValidationError(`rows 第 ${index + 1} 行的 value 必须是有限数值。`);
    }
    for (const field of ["sourceGroup", "targetGroup", "linkGroup"] as const) {
      if (row[field] !== undefined && typeof row[field] !== "string") {
        throw new DocumentValidationError(
          `rows 第 ${index + 1} 行的 ${field} 必须是字符串。`,
        );
      }
    }
    return {
      id: row.id,
      source: row.source,
      target: row.target,
      value: row.value,
      sourceGroup:
        typeof row.sourceGroup === "string" && row.sourceGroup.trim()
          ? row.sourceGroup.trim()
          : undefined,
      targetGroup:
        typeof row.targetGroup === "string" && row.targetGroup.trim()
          ? row.targetGroup.trim()
          : undefined,
      linkGroup:
        typeof row.linkGroup === "string" && row.linkGroup.trim()
          ? row.linkGroup.trim()
          : undefined,
    };
  });
  const rowIds = new Set<string>();
  rows.forEach((row, index) => {
    if (rowIds.has(row.id)) {
      throw new DocumentValidationError(`rows 第 ${index + 1} 行的 id“${row.id}”重复。`);
    }
    rowIds.add(row.id);
  });
  const metadataInput = document.metadata ?? {};
  if (metadataInput.unit !== undefined && typeof metadataInput.unit !== "string") {
    throw new DocumentValidationError("metadata.unit 必须是字符串。");
  }
  return {
    schemaVersion: 8,
    title:
      typeof document.title === "string"
        ? document.title
        : DEFAULT_DOCUMENT.title,
    rows,
    settings,
    metadata: {
      unit: metadataInput.unit ?? DEFAULT_METADATA.unit,
    },
    exportSettings: {
      width: exportSize.width,
      height: exportSize.height,
      dpi,
      physicalWidthMm,
      profileId: "custom",
      background: rawExportSettings.background,
    },
    nodeColors: validHexMap(document.nodeColors),
    labelOverrides: document.labelOverrides ?? {},
    labelTextOverrides: document.labelTextOverrides ?? {},
    labelColorOverrides: validHexMap(document.labelColorOverrides),
    nodeOverrides: document.nodeOverrides ?? {},
  };
}

function loadInitialDocument(): SankeyDocument {
  if (typeof window === "undefined") return cloneDocument(DEFAULT_DOCUMENT);

  try {
    const stored =
      window.localStorage.getItem(STORAGE_KEY) ??
      LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
    if (!stored) return cloneDocument(DEFAULT_DOCUMENT);
    const parsed = JSON.parse(stored) as DocumentInput;
    return normalizeDocument(parsed);
  } catch {
    return cloneDocument(DEFAULT_DOCUMENT);
  }
}

export function useSankeyDocument() {
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: loadInitialDocument(),
    future: [],
  }));
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const document = history.present;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
    } catch (error) {
      console.warn("SankeyPlus 自动保存失败", error);
    }
  }, [document]);

  const commit = useCallback(
    (
      updater:
        | SankeyDocument
        | ((current: SankeyDocument) => SankeyDocument),
    ) => {
      setHistory((current) => {
        const next =
          typeof updater === "function"
            ? updater(cloneDocument(current.present))
            : cloneDocument(updater);
        return {
          past: [...current.past, current.present].slice(-HISTORY_LIMIT),
          present: next,
          future: [],
        };
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.past.length === 0) return current;
      const previous = current.past.at(-1)!;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, HISTORY_LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (current.future.length === 0) return current;
      const next = current.future[0];
      return {
        past: [...current.past, current.present].slice(-HISTORY_LIMIT),
        present: next,
        future: current.future.slice(1),
      };
    });
  }, []);

  const setRows = useCallback(
    (rows: SankeyRow[]) => {
      commit((current) => ({ ...current, rows }));
    },
    [commit],
  );

  const setTitle = useCallback(
    (title: string) => {
      commit((current) => ({ ...current, title }));
    },
    [commit],
  );

  const updateRow = useCallback(
    (id: string, patch: Partial<SankeyRow>) => {
      commit((current) => ({
        ...current,
        rows: current.rows.map((row) =>
          row.id === id ? { ...row, ...patch } : row,
        ),
      }));
    },
    [commit],
  );

  const addRow = useCallback(() => {
    commit((current) => ({
      ...current,
      rows: [
        ...current.rows,
        {
          id: `flow-${crypto.randomUUID()}`,
          source: "新来源",
          target: "新目标",
          value: 1,
        },
      ],
    }));
  }, [commit]);

  const removeRow = useCallback(
    (id: string) => {
      commit((current) => ({
        ...current,
        rows: current.rows.filter((row) => row.id !== id),
      }));
    },
    [commit],
  );

  const setSettings = useCallback(
    (patch: Partial<SankeySettings>) => {
      commit((current) => ({
        ...current,
        settings: { ...current.settings, ...patch },
      }));
    },
    [commit],
  );

  const setCanvasSize = useCallback(
    (width: number, height: number) => {
      commit((current) => {
        const canvasWidth = clampCanvasWidth(width);
        const canvasHeight = clampCanvasHeight(height);
        const widthRatio = canvasWidth / current.settings.canvasWidth;
        const heightRatio = canvasHeight / current.settings.canvasHeight;
        const exportSize = exportPixelSize(
          current.exportSettings.physicalWidthMm,
          current.exportSettings.dpi,
          canvasWidth,
          canvasHeight,
        );
        return {
          ...current,
          settings: {
            ...current.settings,
            canvasWidth,
            canvasHeight,
          },
          exportSettings: {
            ...current.exportSettings,
            width: exportSize.width,
            height: exportSize.height,
          },
          labelOverrides: Object.fromEntries(
            Object.entries(current.labelOverrides).map(([id, position]) => [
              id,
              {
                ...position,
                x: position.x * widthRatio,
                y: position.y * heightRatio,
              },
            ]),
          ),
          nodeOverrides: Object.fromEntries(
            Object.entries(current.nodeOverrides).map(([id, position]) => [
              id,
              { y: position.y * heightRatio },
            ]),
          ),
        };
      });
    },
    [commit],
  );

  const setMetadata = useCallback(
    (patch: Partial<SankeyMetadata>) => {
      commit((current) => ({
        ...current,
        metadata: { ...current.metadata, ...patch },
      }));
    },
    [commit],
  );

  const setExportSettings = useCallback(
    (patch: Partial<SankeyExportSettings>) => {
      commit((current) => ({
        ...current,
        exportSettings: { ...current.exportSettings, ...patch },
      }));
    },
    [commit],
  );

  const setNodeColor = useCallback(
    (nodeId: string, color?: string) => {
      commit((current) => {
        const nodeColors = { ...current.nodeColors };
        if (color && /^#[0-9a-f]{6}$/i.test(color)) {
          nodeColors[nodeId] = color.toUpperCase();
        } else {
          delete nodeColors[nodeId];
        }
        return { ...current, nodeColors };
      });
    },
    [commit],
  );

  const setLabelPositions = useCallback(
    (
      positions: Record<string, Pick<LabelOverride, "x" | "y">>,
    ) => {
      commit((current) => {
        const labelOverrides = { ...current.labelOverrides };
        Object.entries(positions).forEach(([id, position]) => {
          labelOverrides[id] = {
            ...labelOverrides[id],
            ...position,
            locked: labelOverrides[id]?.locked ?? false,
          };
        });
        return { ...current, labelOverrides };
      });
    },
    [commit],
  );

  const setLabelText = useCallback(
    (id: string, text: string) => {
      commit((current) => {
        const normalized = text
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join("\n")
          .slice(0, 240);
        const labelTextOverrides = { ...current.labelTextOverrides };
        if (normalized) labelTextOverrides[id] = normalized;
        else delete labelTextOverrides[id];
        return { ...current, labelTextOverrides };
      });
    },
    [commit],
  );

  const setLabelColor = useCallback(
    (id: string, color?: string) => {
      commit((current) => {
        const labelColorOverrides = { ...current.labelColorOverrides };
        if (color && /^#[0-9a-f]{6}$/i.test(color)) {
          labelColorOverrides[id] = color.toUpperCase();
        } else {
          delete labelColorOverrides[id];
        }
        return { ...current, labelColorOverrides };
      });
    },
    [commit],
  );

  const nudgeLabels = useCallback(
    (
      positions: Record<string, Pick<LabelOverride, "x" | "y">>,
      dx: number,
      dy: number,
    ) => {
      const moved = Object.fromEntries(
        Object.entries(positions).map(([id, position]) => [
          id,
          { x: position.x + dx, y: position.y + dy },
        ]),
      );
      setLabelPositions(moved);
    },
    [setLabelPositions],
  );

  const setNodePositions = useCallback(
    (positions: Record<string, NodeOverride>) => {
      commit((current) => ({
        ...current,
        nodeOverrides: {
          ...current.nodeOverrides,
          ...positions,
        },
      }));
    },
    [commit],
  );

  const toggleLabelLocks = useCallback(
    (
      ids: string[],
      positions: Record<string, Pick<LabelOverride, "x" | "y">>,
    ) => {
      if (ids.length === 0) return;
      commit((current) => {
        const allLocked = ids.every(
          (id) => current.labelOverrides[id]?.locked,
        );
        const labelOverrides = { ...current.labelOverrides };
        ids.forEach((id) => {
          const currentOverride = labelOverrides[id] ?? {
            ...positions[id],
            locked: false,
          };
          labelOverrides[id] = {
            ...currentOverride,
            locked: !allLocked,
          };
        });
        return { ...current, labelOverrides };
      });
    },
    [commit],
  );

  const resetLabels = useCallback(
    (ids?: string[]) => {
      commit((current) => {
        if (!ids || ids.length === 0) {
          return { ...current, labelOverrides: {} };
        }
        const labelOverrides = { ...current.labelOverrides };
        ids.forEach((id) => delete labelOverrides[id]);
        return { ...current, labelOverrides };
      });
    },
    [commit],
  );

  const loadDocument = useCallback((next: unknown) => {
    if (!next || typeof next !== "object") return;
    setHistory({
      past: [],
      present: cloneDocument(normalizeDocument(next as DocumentInput)),
      future: [],
    });
    setSelectedLabelIds([]);
  }, []);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const selection = useMemo(
    () => new Set(selectedLabelIds),
    [selectedLabelIds],
  );

  return {
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
  };
}
