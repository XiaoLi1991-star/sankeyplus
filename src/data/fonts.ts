import type { LabelFontFamily } from "../types";

export interface LabelFontOption {
  id: LabelFontFamily;
  name: string;
  stack: string;
}

export const LABEL_FONT_OPTIONS: LabelFontOption[] = [
  {
    id: "sans",
    name: "Noto Sans SC / 系统黑体",
    stack: "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
  },
  {
    id: "arial",
    name: "Arial",
    stack: "Arial,'PingFang SC','Microsoft YaHei',sans-serif",
  },
  {
    id: "serif",
    name: "Noto Serif SC / 系统宋体",
    stack: "'Noto Serif SC','Songti SC','SimSun',serif",
  },
  {
    id: "times",
    name: "Times New Roman",
    stack: "'Times New Roman','Songti SC','SimSun',serif",
  },
  {
    id: "georgia",
    name: "Georgia",
    stack: "Georgia,'Songti SC','SimSun',serif",
  },
  {
    id: "mono",
    name: "Menlo / 等宽字体",
    stack: "Menlo,Monaco,'Noto Sans Mono CJK SC',monospace",
  },
];

const FONT_STACK_BY_ID = new Map(
  LABEL_FONT_OPTIONS.map((option) => [option.id, option.stack]),
);

export function getLabelFontStack(font: LabelFontFamily): string {
  return FONT_STACK_BY_ID.get(font) ?? LABEL_FONT_OPTIONS[0].stack;
}
