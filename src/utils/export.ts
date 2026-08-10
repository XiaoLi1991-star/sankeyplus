import type { SankeyDocument } from "../types";
import { getLabelFontStack } from "../data/fonts";
import type { PublicationPreflight } from "./publication";
import {
  buildPublicationManifest,
  MAX_RASTER_DIMENSION,
  MAX_RASTER_PIXELS,
} from "./publication";
import { rowsToCsv } from "./csv";
import { pngBlobWithDpi } from "./pngDpi";
import { encodeRgbaTiff } from "./tiff";

function safeName(title: string): string {
  const normalized = title
    .trim()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-|-$/g, "");
  return normalized || "sankeyplus";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function serializeSvg(
  svg: SVGSVGElement,
  document: SankeyDocument,
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-export-ignore]").forEach((node) => node.remove());
  clone.classList.remove(
    "proof-normal",
    "proof-grayscale",
    "proof-protanopia",
    "proof-deuteranopia",
  );
  clone.querySelectorAll('[role="button"]').forEach((node) => {
    node.removeAttribute("role");
    node.removeAttribute("tabindex");
    node.removeAttribute("aria-label");
    node.removeAttribute("aria-pressed");
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const physicalHeightMm =
    (document.exportSettings.physicalWidthMm * document.settings.canvasHeight) /
    document.settings.canvasWidth;
  clone.setAttribute("width", `${document.exportSettings.physicalWidthMm}mm`);
  clone.setAttribute("height", `${physicalHeightMm}mm`);
  clone.setAttribute("data-pixel-width", String(document.exportSettings.width));
  clone.setAttribute("data-pixel-height", String(document.exportSettings.height));
  clone.setAttribute("data-dpi", String(document.exportSettings.dpi));
  clone.setAttribute(
    "viewBox",
    `0 0 ${document.settings.canvasWidth} ${document.settings.canvasHeight}`,
  );

  if (document.exportSettings.background === "white") {
    const background = window.document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", String(document.settings.canvasWidth));
    background.setAttribute("height", String(document.settings.canvasHeight));
    background.setAttribute("fill", "#ffffff");
    clone.insertBefore(background, clone.firstChild);
  }

  const style = window.document.createElementNS(
    "http://www.w3.org/2000/svg",
    "style",
  );
  style.textContent = `text{font-family:${getLabelFontStack(document.settings.fontFamily)}}`;
  clone.insertBefore(style, clone.firstChild);

  const title = window.document.createElementNS(
    "http://www.w3.org/2000/svg",
    "title",
  );
  title.textContent = document.title;
  clone.insertBefore(title, clone.firstChild);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

export function downloadSvg(
  svg: SVGSVGElement,
  document: SankeyDocument,
): void {
  downloadBlob(
    new Blob([serializeSvg(svg, document)], {
      type: "image/svg+xml;charset=utf-8",
    }),
    `${safeName(document.title)}.svg`,
  );
}

async function renderExportCanvas(
  svg: SVGSVGElement,
  document: SankeyDocument,
): Promise<HTMLCanvasElement> {
  const { width, height } = document.exportSettings;
  if (
    width * height > MAX_RASTER_PIXELS ||
    width > MAX_RASTER_DIMENSION ||
    height > MAX_RASTER_DIMENSION
  ) {
    throw new Error(
      `光栅输出 ${width.toLocaleString("zh-CN")} × ${height.toLocaleString("zh-CN")} px 超过安全上限，请降低尺寸或 DPI。`,
    );
  }
  const source = serializeSvg(svg, document);
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    image.decoding = "sync";
    image.src = url;
    await image.decode();

    const canvas = window.document.createElement("canvas");
    canvas.width = document.exportSettings.width;
    canvas.height = document.exportSettings.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建图片画布。");
    if (document.exportSettings.background === "white") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPng(
  svg: SVGSVGElement,
  document: SankeyDocument,
): Promise<void> {
  const canvas = await renderExportCanvas(svg, document);
  const canvasBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("PNG 导出失败。")),
      "image/png",
    );
  });
  const blob = await pngBlobWithDpi(canvasBlob, document.exportSettings.dpi);
  downloadBlob(
    blob,
    `${safeName(document.title)}-${canvas.width}x${canvas.height}.png`,
  );
}

export async function downloadTiff(
  svg: SVGSVGElement,
  document: SankeyDocument,
): Promise<void> {
  const canvas = await renderExportCanvas(svg, document);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建 TIFF 画布。");
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let pixels: Uint8ClampedArray | Uint8Array = rgba;
  if (document.exportSettings.background === "white") {
    const rgb = new Uint8Array(canvas.width * canvas.height * 3);
    for (let source = 0, target = 0; source < rgba.length; source += 4) {
      rgb[target] = rgba[source];
      rgb[target + 1] = rgba[source + 1];
      rgb[target + 2] = rgba[source + 2];
      target += 3;
    }
    pixels = rgb;
  }
  const bytes = encodeRgbaTiff(
    canvas.width,
    canvas.height,
    pixels,
    document.exportSettings.dpi,
  );
  const buffer = bytes.slice().buffer as ArrayBuffer;
  downloadBlob(
    new Blob([buffer], { type: "image/tiff" }),
    `${safeName(document.title)}-${canvas.width}x${canvas.height}.tiff`,
  );
}

export function printFigure(
  svg: SVGSVGElement,
  document: SankeyDocument,
): void {
  const source = serializeSvg(svg, document);
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
  );
  const popup = window.open(url, "_blank");
  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error("浏览器阻止了打印窗口，请允许弹出窗口后重试。");
  }
  popup.addEventListener(
    "load",
    () => {
      popup.focus();
      popup.print();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    { once: true },
  );
}

export function downloadDocument(document: SankeyDocument): void {
  downloadBlob(
    new Blob([JSON.stringify(document, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    `${safeName(document.title)}.sankeyplus.json`,
  );
}

export async function downloadPublicationManifest(
  document: SankeyDocument,
  preflight: PublicationPreflight,
  denominatorLabel: string,
): Promise<void> {
  const manifest = await buildPublicationManifest(
    document,
    preflight,
    denominatorLabel,
  );
  downloadBlob(
    new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    `${safeName(document.title)}-publication-manifest.json`,
  );
}

export function downloadCsv(document: SankeyDocument): void {
  downloadBlob(
    new Blob([`\uFEFF${rowsToCsv(document.rows)}`], {
      type: "text/csv;charset=utf-8",
    }),
    `${safeName(document.title)}.csv`,
  );
}
