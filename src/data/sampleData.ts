import type { SankeyDocument, SankeyRow } from "../types";

type RowInput = Omit<SankeyRow, "id">;

function rows(values: RowInput[]): SankeyRow[] {
  return values.map((row, index) => ({
    id: `flow-${index + 1}`,
    ...row,
  }));
}

const energyRows = rows([
  { source: "太阳能", target: "电力系统", value: 34, sourceGroup: "可再生能源", targetGroup: "转换与输配", linkGroup: "可再生能源" },
  { source: "风能", target: "电力系统", value: 26, sourceGroup: "可再生能源", targetGroup: "转换与输配", linkGroup: "可再生能源" },
  { source: "天然气", target: "电力系统", value: 20, sourceGroup: "化石能源", targetGroup: "转换与输配", linkGroup: "化石能源" },
  { source: "天然气", target: "热力系统", value: 30, sourceGroup: "化石能源", targetGroup: "转换与输配", linkGroup: "化石能源" },
  { source: "电力系统", target: "工业", value: 25, sourceGroup: "转换与输配", targetGroup: "终端使用", linkGroup: "电力" },
  { source: "电力系统", target: "建筑", value: 20, sourceGroup: "转换与输配", targetGroup: "终端使用", linkGroup: "电力" },
  { source: "电力系统", target: "交通", value: 15, sourceGroup: "转换与输配", targetGroup: "终端使用", linkGroup: "电力" },
  { source: "电力系统", target: "转换损失", value: 20, sourceGroup: "转换与输配", targetGroup: "损失", linkGroup: "损失" },
  { source: "热力系统", target: "建筑", value: 20, sourceGroup: "转换与输配", targetGroup: "终端使用", linkGroup: "热力" },
  { source: "热力系统", target: "工业", value: 7, sourceGroup: "转换与输配", targetGroup: "终端使用", linkGroup: "热力" },
  { source: "热力系统", target: "转换损失", value: 3, sourceGroup: "转换与输配", targetGroup: "损失", linkGroup: "损失" },
]);

const processRows = rows([
  { source: "入口 A", target: "评估", value: 120, sourceGroup: "入口", targetGroup: "处理中", linkGroup: "入口 A" },
  { source: "入口 B", target: "评估", value: 90, sourceGroup: "入口", targetGroup: "处理中", linkGroup: "入口 B" },
  { source: "入口 C", target: "直接处理", value: 60, sourceGroup: "入口", targetGroup: "处理中", linkGroup: "入口 C" },
  { source: "评估", target: "路径 1", value: 100, sourceGroup: "处理中", targetGroup: "处理中", linkGroup: "路径 1" },
  { source: "评估", target: "路径 2", value: 110, sourceGroup: "处理中", targetGroup: "处理中", linkGroup: "路径 2" },
  { source: "路径 1", target: "完成", value: 80, sourceGroup: "处理中", targetGroup: "终点", linkGroup: "路径 1" },
  { source: "路径 1", target: "返工", value: 20, sourceGroup: "处理中", targetGroup: "终点", linkGroup: "路径 1" },
  { source: "路径 2", target: "完成", value: 90, sourceGroup: "处理中", targetGroup: "终点", linkGroup: "路径 2" },
  { source: "路径 2", target: "退出", value: 20, sourceGroup: "处理中", targetGroup: "终点", linkGroup: "路径 2" },
  { source: "直接处理", target: "完成", value: 45, sourceGroup: "处理中", targetGroup: "终点", linkGroup: "入口 C" },
  { source: "直接处理", target: "退出", value: 15, sourceGroup: "处理中", targetGroup: "终点", linkGroup: "入口 C" },
]);

const denseCategoryNames = Array.from(
  { length: 24 },
  (_, index) => `类别 ${String(index + 1).padStart(2, "0")}`,
);
const denseGroupNames = ["分组 A", "分组 B", "分组 C", "分组 D", "分组 E", "分组 F"];
const denseRows = rows(
  denseCategoryNames.flatMap((category, index): RowInput[] => {
    const value = 1500 - index * 45;
    const group = denseGroupNames[Math.floor(index / 4)];
    const destination = `去向 ${(index % 4) + 1}`;
    return [
      {
        source: "总体",
        target: category,
        value,
        sourceGroup: "总体",
        targetGroup: group,
        linkGroup: group,
      },
      {
        source: category,
        target: destination,
        value,
        sourceGroup: group,
        targetGroup: "去向",
        linkGroup: group,
      },
    ];
  }),
);

export const DEFAULT_SETTINGS: SankeyDocument["settings"] = {
  canvasWidth: 1100,
  canvasHeight: 720,
  paletteId: "scientific-12",
  nodeColorMode: "individual",
  nodeBaseColor: "#64748B",
  linkOpacity: 0.44,
  linkColorMode: "source",
  nodeWidth: 30,
  nodePadding: 24,
  alignment: "justify",
  fontFamily: "arial",
  fontColor: "#111827",
  labelColorMode: "fixed",
  fontWeight: 500,
  fontStyle: "normal",
  fontSize: 16,
  labelPlacement: "outside",
  labelMode: "name",
  percentageBasis: "cohort",
  customDenominator: 300,
  valueDecimals: 0,
  showLeaderLines: true,
  leaderLineThresholdPx: 20,
};

export const DEFAULT_METADATA: SankeyDocument["metadata"] = {
  unit: "",
};

export const DEFAULT_EXPORT_SETTINGS: SankeyDocument["exportSettings"] = {
  width: 2161,
  height: 1414,
  physicalWidthMm: 183,
  dpi: 300,
  profileId: "custom",
  background: "white",
};

function sampleDocument(
  title: string,
  sampleRows: SankeyRow[],
  settings: SankeyDocument["settings"],
  metadata: Partial<SankeyDocument["metadata"]>,
): SankeyDocument {
  return {
    schemaVersion: 8,
    title,
    rows: sampleRows,
    settings,
    metadata: { ...DEFAULT_METADATA, ...metadata },
    exportSettings: DEFAULT_EXPORT_SETTINGS,
    nodeColors: {},
    labelOverrides: {},
    labelTextOverrides: {},
    labelColorOverrides: {},
    nodeOverrides: {},
  };
}

export const SAMPLE_DOCUMENTS: Array<{
  id: string;
  name: string;
  buttonLabel: string;
  description: string;
  document: SankeyDocument;
}> = [
  {
    id: "energy-flow",
    name: "能源转换与终端使用",
    buttonLabel: "能源流向",
    description: "推荐默认样式：节点颜色不重复，流带跟随来源。",
    document: sampleDocument(
      "能源转换与终端使用",
      energyRows,
      {
        ...DEFAULT_SETTINGS,
        paletteId: "scientific-12",
        nodeColorMode: "individual",
        linkColorMode: "source",
        customDenominator: 110,
      },
      { unit: "MWh" },
    ),
  },
  {
    id: "process-flow",
    name: "多阶段流程路径",
    buttonLabel: "阶段流程",
    description: "通用阶段数据，演示有序色板与中性色带。",
    document: sampleDocument(
      "多阶段流程路径",
      processRows,
      {
        ...DEFAULT_SETTINGS,
        paletteId: "viridis",
        nodeColorMode: "stage",
        linkColorMode: "neutral",
        customDenominator: 270,
      },
      { unit: "项" },
    ),
  },
  {
    id: "dense-categories",
    name: "密集分类与去向",
    buttonLabel: "密集分类",
    description: "单列 24 个类别；仅显示名称，并按可选分组着色。",
    document: sampleDocument(
      "密集分类与去向",
      denseRows,
      {
        ...DEFAULT_SETTINGS,
        paletteId: "tol-muted",
        nodeColorMode: "group",
        linkColorMode: "group",
        linkOpacity: 0.32,
        nodePadding: 7,
        labelMode: "name",
        customDenominator: denseCategoryNames.reduce(
          (sum, _, index) => sum + 1500 - index * 45,
          0,
        ),
      },
      { unit: "单位" },
    ),
  },
];

export const DEFAULT_DOCUMENT: SankeyDocument = structuredClone(
  SAMPLE_DOCUMENTS[0].document,
);
