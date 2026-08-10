import {
  interpolateViridis,
  schemeSet2,
  schemeTableau10,
} from "d3-scale-chromatic";
import type { PaletteId } from "../types";

export interface ScientificPalette {
  id: PaletteId;
  name: string;
  description: string;
  kind: "categorical" | "ordered";
  colors: string[];
}

const viridis = Array.from({ length: 8 }, (_, index) =>
  interpolateViridis(index / 7),
);

export const SCIENTIFIC_PALETTES: ScientificPalette[] = [
  {
    id: "scientific-12",
    name: "Sankey Scientific 12",
    description: "常见桑基图的高区分度 12 色分类色板",
    kind: "categorical",
    colors: [
      "#1F78B4",
      "#FF7F00",
      "#33A02C",
      "#E31A1C",
      "#6A3D9A",
      "#B15928",
      "#A6CEE3",
      "#FDBF6F",
      "#B2DF8A",
      "#FB9A99",
      "#CAB2D6",
      "#FFFF99",
    ],
  },
  {
    id: "okabe-ito",
    name: "Okabe–Ito",
    description: "色觉友好的高区分度分类色",
    kind: "categorical",
    colors: [
      "#0072B2",
      "#E69F00",
      "#009E73",
      "#F0E442",
      "#56B4E9",
      "#D55E00",
      "#CC79A7",
      "#6B7280",
    ],
  },
  {
    id: "viridis",
    name: "Viridis",
    description: "亮度单调、适合连续或有序数据",
    kind: "ordered",
    colors: viridis,
  },
  {
    id: "tol-muted",
    name: "Tol Muted",
    description: "柔和且适合论文图形的分类色",
    kind: "categorical",
    colors: [
      "#332288",
      "#88CCEE",
      "#44AA99",
      "#117733",
      "#999933",
      "#DDCC77",
      "#CC6677",
      "#AA4499",
      "#882255",
    ],
  },
  {
    id: "colorbrewer",
    name: "ColorBrewer",
    description: "均衡的科研分类色",
    kind: "categorical",
    colors: [...(schemeSet2 ?? schemeTableau10)],
  },
];

export function getPalette(id: PaletteId): ScientificPalette {
  return (
    SCIENTIFIC_PALETTES.find((palette) => palette.id === id) ??
    SCIENTIFIC_PALETTES[0]
  );
}

export function getReadableTextColor(background: string): string {
  const normalized = background.replace("#", "");
  const value = Number.parseInt(
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => part + part)
          .join("")
      : normalized,
    16,
  );
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#111827" : "#FFFFFF";
}
