import { csvParse, tsvParse } from "d3-dsv";
import type { SankeyRow } from "../types";

export interface ParseResult {
  rows: SankeyRow[];
  errors: string[];
}

const SOURCE_HEADERS = ["source", "来源", "源", "from"];
const TARGET_HEADERS = ["target", "目标", "去向", "to"];
const VALUE_HEADERS = ["value", "值", "数量", "weight"];
const SOURCE_GROUP_HEADERS = ["source_group", "sourcegroup", "来源分组", "源分组"];
const TARGET_GROUP_HEADERS = ["target_group", "targetgroup", "目标分组", "去向分组"];
const LINK_GROUP_HEADERS = ["link_group", "linkgroup", "连接分组", "流带分组"];

function findHeader(headers: string[], candidates: string[]): string | undefined {
  return headers.find((header) =>
    candidates.includes(header.trim().toLowerCase()),
  );
}

export function parseDelimitedText(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { rows: [], errors: ["请输入或上传包含数据的 CSV/TSV 文件。"] };
  }

  const parse = trimmed.split("\n", 1)[0].includes("\t") ? tsvParse : csvParse;
  const parsed = parse(trimmed);
  const headers = parsed.columns ?? [];
  const sourceHeader = findHeader(headers, SOURCE_HEADERS);
  const targetHeader = findHeader(headers, TARGET_HEADERS);
  const valueHeader = findHeader(headers, VALUE_HEADERS);
  const sourceGroupHeader = findHeader(headers, SOURCE_GROUP_HEADERS);
  const targetGroupHeader = findHeader(headers, TARGET_GROUP_HEADERS);
  const linkGroupHeader = findHeader(headers, LINK_GROUP_HEADERS);

  if (!sourceHeader || !targetHeader || !valueHeader) {
    return {
      rows: [],
      errors: ["表头必须包含 source、target、value（也支持来源、目标、值）。"],
    };
  }

  const errors: string[] = [];
  const rows: SankeyRow[] = [];

  parsed.forEach((record, index) => {
    const source = String(record[sourceHeader] ?? "").trim();
    const target = String(record[targetHeader] ?? "").trim();
    const value = Number(record[valueHeader]);

    if (!source || !target) {
      errors.push(`第 ${index + 2} 行缺少 source 或 target。`);
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`第 ${index + 2} 行的 value 必须是大于 0 的数字。`);
      return;
    }

    rows.push({
      id: `imported-${index + 1}`,
      source,
      target,
      value,
      sourceGroup: sourceGroupHeader
        ? String(record[sourceGroupHeader] ?? "").trim() || undefined
        : undefined,
      targetGroup: targetGroupHeader
        ? String(record[targetGroupHeader] ?? "").trim() || undefined
        : undefined,
      linkGroup: linkGroupHeader
        ? String(record[linkGroupHeader] ?? "").trim() || undefined
        : undefined,
    });
  });

  return { rows, errors };
}

export function rowsToCsv(rows: SankeyRow[]): string {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  const hasGroups = rows.some(
    (row) => row.sourceGroup || row.targetGroup || row.linkGroup,
  );
  const headers = hasGroups
    ? ["source", "target", "value", "source_group", "target_group", "link_group"]
    : ["source", "target", "value"];
  return [
    headers.join(","),
    ...rows.map((row) => {
      const values: Array<string | number> = [row.source, row.target, row.value];
      if (hasGroups) {
        values.push(row.sourceGroup ?? "", row.targetGroup ?? "", row.linkGroup ?? "");
      }
      return values.map(escape).join(",");
    }),
  ].join("\n");
}
