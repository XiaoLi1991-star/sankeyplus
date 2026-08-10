export interface SankeyRow {
  id: string;
  source: string;
  target: string;
  value: number;
  sourceGroup?: string;
  targetGroup?: string;
  linkGroup?: string;
}

export type PaletteId =
  | "scientific-12"
  | "okabe-ito"
  | "viridis"
  | "tol-muted"
  | "colorbrewer";

export type NodeColorMode = "single" | "stage" | "group" | "individual";
export type LinkColorMode =
  | "source"
  | "target"
  | "gradient"
  | "group"
  | "neutral";
export type SankeyAlignment = "justify" | "left" | "right" | "center";
export type LabelFontFamily =
  | "sans"
  | "arial"
  | "serif"
  | "times"
  | "georgia"
  | "mono";
export type LabelFontWeight = 500 | 700;
export type LabelFontStyle = "normal" | "italic";
export type LabelColorMode = "fixed" | "auto";
export type LabelPlacement = "outside" | "inside";
export type LabelMode =
  | "name"
  | "name-value"
  | "name-percent"
  | "name-value-percent";

export type PercentageBasis = "cohort" | "column" | "custom";
export type ExportBackground = "white" | "transparent";
export type PublicationProfileId = "custom";
export type ProofMode = "normal" | "grayscale" | "protanopia" | "deuteranopia";

export type LabelOperationScope =
  | "selection"
  | "all"
  | `column:${number}`;

export interface LabelScopeOption {
  value: LabelOperationScope;
  label: string;
  count: number;
}

export interface LabelOverride {
  x: number;
  y: number;
  locked: boolean;
}

export interface NodeOverride {
  y: number;
}

export interface SankeySettings {
  canvasWidth: number;
  canvasHeight: number;
  paletteId: PaletteId;
  nodeColorMode: NodeColorMode;
  nodeBaseColor: string;
  linkOpacity: number;
  linkColorMode: LinkColorMode;
  nodeWidth: number;
  nodePadding: number;
  alignment: SankeyAlignment;
  fontFamily: LabelFontFamily;
  fontColor: string;
  labelColorMode: LabelColorMode;
  fontWeight: LabelFontWeight;
  fontStyle: LabelFontStyle;
  fontSize: number;
  labelPlacement: LabelPlacement;
  labelMode: LabelMode;
  percentageBasis: PercentageBasis;
  customDenominator: number;
  valueDecimals: number;
  showLeaderLines: boolean;
  leaderLineThresholdPx: number;
}

export interface SankeyMetadata {
  unit: string;
}

export interface SankeyExportSettings {
  width: number;
  height: number;
  physicalWidthMm: number;
  dpi: number;
  profileId: PublicationProfileId;
  background: ExportBackground;
}

export interface SankeyDocument {
  schemaVersion: 8;
  title: string;
  rows: SankeyRow[];
  settings: SankeySettings;
  metadata: SankeyMetadata;
  exportSettings: SankeyExportSettings;
  nodeColors: Record<string, string>;
  labelOverrides: Record<string, LabelOverride>;
  labelTextOverrides: Record<string, string>;
  labelColorOverrides: Record<string, string>;
  nodeOverrides: Record<string, NodeOverride>;
}

export interface LabelPosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  locked: boolean;
  leaderLine?: boolean;
}

export type AlignOperation =
  | "left"
  | "h-center"
  | "right"
  | "top"
  | "v-center"
  | "bottom"
  | "distribute-x"
  | "distribute-y";
