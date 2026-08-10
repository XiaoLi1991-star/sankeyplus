import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "./publication";

export const MIN_CANVAS_ZOOM = 0.5;
export const MAX_CANVAS_ZOOM = 2.5;
export const CANVAS_ZOOM_STEP = 0.25;
export const MIN_CANVAS_WIDTH = 600;
export const MAX_CANVAS_WIDTH = 2400;
export const MIN_CANVAS_HEIGHT = 400;
export const MAX_CANVAS_HEIGHT = 1800;
export const MOBILE_PORTRAIT_INITIAL_ZOOM = 1.75;

export interface CanvasViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  canPanX: boolean;
  canPanY: boolean;
}

export function clampCanvasZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, value));
}

export function getInitialCanvasZoom(
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) {
    return 1;
  }
  return viewportWidth <= 480 && viewportHeight > viewportWidth
    ? MOBILE_PORTRAIT_INITIAL_ZOOM
    : 1;
}

export function clampCanvasWidth(value: number): number {
  if (!Number.isFinite(value)) return ARTBOARD_WIDTH;
  return Math.round(Math.min(MAX_CANVAS_WIDTH, Math.max(MIN_CANVAS_WIDTH, value)));
}

export function clampCanvasHeight(value: number): number {
  if (!Number.isFinite(value)) return ARTBOARD_HEIGHT;
  return Math.round(Math.min(MAX_CANVAS_HEIGHT, Math.max(MIN_CANVAS_HEIGHT, value)));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function buildCanvasViewport(
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  panX = 0,
  panY = 0,
  artboardWidth = ARTBOARD_WIDTH,
  artboardHeight = ARTBOARD_HEIGHT,
): CanvasViewport {
  const safeArtboardWidth = Math.max(1, artboardWidth || ARTBOARD_WIDTH);
  const safeArtboardHeight = Math.max(1, artboardHeight || ARTBOARD_HEIGHT);
  const safeViewportWidth = Math.max(1, viewportWidth || safeArtboardWidth);
  const safeViewportHeight = Math.max(1, viewportHeight || safeArtboardHeight);
  const viewportAspect = safeViewportWidth / safeViewportHeight;
  const artboardAspect = safeArtboardWidth / safeArtboardHeight;
  const safeZoom = clampCanvasZoom(zoom);

  const fitWidth =
    viewportAspect >= artboardAspect
      ? safeArtboardHeight * viewportAspect
      : safeArtboardWidth;
  const fitHeight =
    viewportAspect >= artboardAspect
      ? safeArtboardHeight
      : safeArtboardWidth / viewportAspect;
  const width = fitWidth / safeZoom;
  const height = fitHeight / safeZoom;
  const canPanX = width < safeArtboardWidth;
  const canPanY = height < safeArtboardHeight;
  const centerX = canPanX
    ? clamp(
        safeArtboardWidth / 2 + panX,
        width / 2,
        safeArtboardWidth - width / 2,
      )
    : safeArtboardWidth / 2;
  const centerY = canPanY
    ? clamp(
        safeArtboardHeight / 2 + panY,
        height / 2,
        safeArtboardHeight - height / 2,
      )
    : safeArtboardHeight / 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    canPanX,
    canPanY,
  };
}
