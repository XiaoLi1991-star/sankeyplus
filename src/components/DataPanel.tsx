import { Fragment, useRef, useState } from "react";
import {
  Download,
  FileUp,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { SAMPLE_DOCUMENTS } from "../data/sampleData";
import type { SankeyMetadata, SankeyRow } from "../types";
import { parseDelimitedText } from "../utils/csv";
import type { QualityReport } from "../utils/quality";
import { Field, IconButton } from "./ui";

export type DataPanelTab = "data" | "quality";

interface DataPanelProps {
  activeTab: DataPanelTab;
  rows: SankeyRow[];
  metadata: SankeyMetadata;
  qualityReport: QualityReport;
  onUpdateRow: (id: string, patch: Partial<SankeyRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onSetRows: (rows: SankeyRow[]) => void;
  onLoadDocument: (document: unknown) => void;
  onMetadataChange: (patch: Partial<SankeyMetadata>) => void;
  onDownloadCsv: () => void;
  onTabChange: (tab: DataPanelTab) => void;
  onClose: () => void;
  mobileOpen: boolean;
}

export function DataPanel({
  activeTab,
  rows,
  metadata,
  qualityReport,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
  onSetRows,
  onLoadDocument,
  onMetadataChange,
  onDownloadCsv,
  onTabChange,
  onClose,
  mobileOpen,
}: DataPanelProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [showGroups, setShowGroups] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyText = (text: string) => {
    const result = parseDelimitedText(text);
    setErrors(result.errors);
    if (result.errors.length === 0 && result.rows.length > 0) {
      onSetRows(result.rows);
      setPasteOpen(false);
      setPasteValue("");
    }
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".json")) {
      try {
        onLoadDocument(JSON.parse(text));
        setErrors([]);
      } catch (error) {
        setErrors([
          error instanceof Error
            ? `JSON 导入失败：${error.message}`
            : "SankeyPlus JSON 文档无法解析，请检查文件内容。",
        ]);
      }
      return;
    }
    applyText(text);
  };

  return (
    <aside
      className={`side-panel data-panel ${mobileOpen ? "is-mobile-open" : ""}`}
      aria-label="数据面板"
    >
      <div className="mobile-sheet-handle mobile-only" />
      <div className="panel-tabs">
        <button
          type="button"
          className={activeTab === "data" ? "is-active" : ""}
          onClick={() => onTabChange("data")}
        >
          数据
        </button>
        <button
          type="button"
          className={activeTab === "quality" ? "is-active" : ""}
          onClick={() => onTabChange("quality")}
        >
          检查
          {qualityReport.errorCount + qualityReport.warningCount > 0 ? (
            <span className="tab-count">
              {qualityReport.errorCount + qualityReport.warningCount}
            </span>
          ) : null}
        </button>
        <IconButton
          className="mobile-only panel-close"
          icon={X}
          label="关闭数据面板"
          size="compact"
          onClick={onClose}
        />
      </div>

      {activeTab === "data" ? (
        <>
          <div className="panel-heading">
            <div>
              <h2>数据表</h2>
              <p>每行表示一条来源—目标流向。</p>
            </div>
            <span>{rows.length} 条</span>
          </div>

          <div className="data-unit-field">
            <Field
              label="数值单位（可选）"
              hint="用于标签与悬停提示，例如 kg、件、MWh。"
            >
              <input
                aria-label="数值单位"
                value={metadata.unit}
                placeholder="不填写则只显示数值"
                maxLength={24}
                onChange={(event) =>
                  onMetadataChange({ unit: event.target.value })
                }
              />
            </Field>
          </div>

          <div className="data-options">
            <label>
              <input
                type="checkbox"
                checked={showGroups}
                onChange={(event) => setShowGroups(event.target.checked)}
              />
              编辑可选分组列
            </label>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>来源</th>
                  <th>目标</th>
                  <th>值</th>
                  <th>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                  <tr>
                    <td>
                      <input
                        aria-label="来源"
                        value={row.source}
                        onChange={(event) =>
                          onUpdateRow(row.id, { source: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label="目标"
                        value={row.target}
                        onChange={(event) =>
                          onUpdateRow(row.id, { target: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label="值"
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={row.value}
                        onChange={(event) =>
                          onUpdateRow(row.id, {
                            value: Number(event.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <IconButton
                        icon={Trash2}
                        label={`删除 ${row.source} 到 ${row.target}`}
                        size="compact"
                        onClick={() => onRemoveRow(row.id)}
                      />
                    </td>
                  </tr>
                  {showGroups ? (
                    <tr className="data-group-row">
                      <td colSpan={4}>
                        <div className="data-group-fields">
                          <label>
                            <span>来源分组</span>
                            <input
                              aria-label={`${row.source} 来源分组`}
                              value={row.sourceGroup ?? ""}
                              placeholder="可选"
                              onChange={(event) =>
                                onUpdateRow(row.id, {
                                  sourceGroup: event.target.value || undefined,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>目标分组</span>
                            <input
                              aria-label={`${row.target} 目标分组`}
                              value={row.targetGroup ?? ""}
                              placeholder="可选"
                              onChange={(event) =>
                                onUpdateRow(row.id, {
                                  targetGroup: event.target.value || undefined,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>连接分组</span>
                            <input
                              aria-label={`${row.source} 到 ${row.target} 连接分组`}
                              value={row.linkGroup ?? ""}
                              placeholder="可选"
                              onChange={(event) =>
                                onUpdateRow(row.id, {
                                  linkGroup: event.target.value || undefined,
                                })
                              }
                            />
                          </label>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="data-actions">
            <button type="button" className="secondary-button" onClick={onAddRow}>
              <Plus aria-hidden="true" />
              添加行
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onDownloadCsv}
            >
              <Download aria-hidden="true" />
              CSV
            </button>
          </div>

          <div className="import-section">
            <h3>导入数据</h3>
            <div className="import-buttons">
              <button
                type="button"
                className="secondary-button"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp aria-hidden="true" />
                CSV / TSV / JSON
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPasteOpen((open) => !open)}
              >
                粘贴表格
              </button>
            </div>
            <input
              ref={fileRef}
              className="sr-only"
              type="file"
              accept=".csv,.tsv,.json,text/csv,text/tab-separated-values,application/json"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />

            {pasteOpen ? (
              <div className="paste-editor">
                <textarea
                  value={pasteValue}
                  onChange={(event) => setPasteValue(event.target.value)}
                  placeholder={"source,target,value\n来源 A,目标 B,120"}
                  aria-label="粘贴 CSV 或 TSV 数据"
                />
                <div className="paste-editor__actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setPasteOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => applyText(pasteValue)}
                  >
                    应用
                  </button>
                </div>
              </div>
            ) : null}

            {errors.length > 0 ? (
              <div className="data-errors" role="alert">
                {errors.slice(0, 3).map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            ) : null}
            <div className="sample-import-section">
              <div className="sample-import-heading">
                <h4>载入示例</h4>
                <span>将替换当前内容</span>
              </div>
              <div className="sample-import-buttons" aria-label="载入示例数据">
                {SAMPLE_DOCUMENTS.map((sample) => (
                  <button
                    type="button"
                    className="secondary-button"
                    key={sample.id}
                    title={sample.description}
                    aria-label={`载入示例：${sample.name}。${sample.description}`}
                    onClick={() => onLoadDocument(sample.document)}
                  >
                    <span>{sample.buttonLabel}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="format-hint">
              必需列：<code>source</code>、<code>target</code>、<code>value</code>
              ；可选列：<code>source_group</code>、<code>target_group</code>、
              <code>link_group</code>
            </p>
          </div>
        </>
      ) : (
        <div className="quality-panel">
          <div className="panel-heading">
            <div>
              <h2>数据质量</h2>
              <p>检查结构、重复流向与中间节点守恒。</p>
            </div>
          </div>
          <div className="quality-summary" aria-label="质量检查摘要">
            <span className="is-error">错误 {qualityReport.errorCount}</span>
            <span className="is-warning">警告 {qualityReport.warningCount}</span>
            <span className="is-info">通过 {qualityReport.infoCount}</span>
          </div>
          <div className="quality-list">
            {qualityReport.issues.map((issue) => (
              <article
                className={`quality-issue is-${issue.severity}`}
                key={issue.id}
              >
                <strong>{issue.title}</strong>
                <p>{issue.detail}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
