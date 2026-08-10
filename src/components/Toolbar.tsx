import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Database,
  Download,
  FileJson,
  FileCheck2,
  FileType2,
  Image,
  Printer,
  Redo2,
  Save,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { IconButton } from "./ui";
interface ToolbarProps {
  title: string;
  canUndo: boolean;
  canRedo: boolean;
  onTitleChange: (title: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onExport: (
    type: "svg" | "png" | "tiff" | "csv" | "print" | "manifest",
  ) => void;
  onOpenData: () => void;
  onOpenInspector: () => void;
}

export function Toolbar({
  title,
  canUndo,
  canRedo,
  onTitleChange,
  onUndo,
  onRedo,
  onSave,
  onExport,
  onOpenData,
  onOpenInspector,
}: ToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setExportOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [exportOpen]);

  return (
    <header className="app-toolbar">
      <div className="app-brand" aria-label="SankeyPlus">
        <span>Sankey</span>
        <strong>Plus</strong>
      </div>

      <div className="toolbar-divider" />

      <div className="mobile-only toolbar-group">
        <IconButton
          icon={Database}
          label="打开数据面板"
          onClick={onOpenData}
        />
      </div>

      <div className="toolbar-group">
        <IconButton
          icon={Undo2}
          label="撤销"
          disabled={!canUndo}
          onClick={onUndo}
        />
        <IconButton
          icon={Redo2}
          label="重做"
          disabled={!canRedo}
          onClick={onRedo}
        />
      </div>

      <div className="toolbar-divider desktop-only" />

      <div className="toolbar-tooltip-wrap desktop-only">
        <button
          type="button"
          className="toolbar-button"
          aria-label="保存项目 JSON（可重新导入）"
          aria-describedby="save-project-tooltip"
          onClick={onSave}
        >
          <Save aria-hidden="true" />
          <span>保存项目 JSON</span>
        </button>
        <span
          id="save-project-tooltip"
          className="toolbar-tooltip"
          role="tooltip"
        >
          保存的是项目 JSON，可在“数据 → CSV / TSV / JSON”重新导入；图片请使用“导出”。
        </span>
      </div>

      <div className="toolbar-export" ref={menuRef}>
        <button
          ref={triggerRef}
          type="button"
          className="toolbar-button"
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          onClick={() => setExportOpen((open) => !open)}
        >
          <Download aria-hidden="true" />
          <span className="desktop-only">导出</span>
          <ChevronDown className="toolbar-button__chevron" aria-hidden="true" />
        </button>
        {exportOpen ? (
          <div className="export-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onExport("svg");
                setExportOpen(false);
              }}
            >
              <FileType2 aria-hidden="true" />
              <span>
                <strong>SVG 矢量图</strong>
                <small>适合论文排版与后期编辑</small>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onExport("tiff");
                setExportOpen(false);
              }}
            >
              <Image aria-hidden="true" />
              <span>
                <strong>TIFF 投稿图</strong>
                <small>无损 RGBA，写入当前物理 DPI</small>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onExport("png");
                setExportOpen(false);
              }}
            >
              <Image aria-hidden="true" />
              <span>
                <strong>PNG 图片</strong>
                <small>按输出面板的尺寸与背景生成</small>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onExport("print");
                setExportOpen(false);
              }}
            >
              <Printer aria-hidden="true" />
              <span>
                <strong>打印 / PDF</strong>
                <small>打开系统打印窗口并另存 PDF</small>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onExport("csv");
                setExportOpen(false);
              }}
            >
              <FileJson aria-hidden="true" />
              <span>
                <strong>CSV 数据</strong>
                <small>导出当前流向表</small>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onExport("manifest");
                setExportOpen(false);
              }}
            >
              <FileCheck2 aria-hidden="true" />
              <span>
                <strong>发表清单 JSON</strong>
                <small>数据与设置哈希、尺寸和预检结果</small>
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="toolbar-spacer" />

      <input
        className="document-title desktop-only"
        value={title}
        aria-label="图表标题"
        onChange={(event) => onTitleChange(event.target.value)}
      />

      <div className="mobile-only toolbar-group">
        <IconButton
          icon={SlidersHorizontal}
          label="打开设置面板"
          onClick={onOpenInspector}
        />
      </div>
    </header>
  );
}
