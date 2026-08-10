import { describe, expect, it } from "vitest";
import {
  buildCanvasViewport,
  clampCanvasZoom,
  getInitialCanvasZoom,
  MAX_CANVAS_ZOOM,
  MOBILE_PORTRAIT_INITIAL_ZOOM,
  MIN_CANVAS_ZOOM,
} from "./canvasViewport";

describe("canvas viewport", () => {
  it("fits the full artboard at 100% when the viewport has the same ratio", () => {
    expect(buildCanvasViewport(1100, 720, 1)).toMatchObject({
      x: 0,
      y: 0,
      width: 1100,
      height: 720,
      canPanX: false,
      canPanY: false,
    });
  });

  it("keeps a zoomed-out artboard centered instead of shifting it", () => {
    const viewport = buildCanvasViewport(1100, 720, 0.5);

    expect(viewport.x).toBeCloseTo(-550);
    expect(viewport.y).toBeCloseTo(-360);
    expect(viewport.width).toBeCloseTo(2200);
    expect(viewport.height).toBeCloseTo(1440);
  });

  it("adapts the fitted viewBox to a portrait canvas without distortion", () => {
    const viewport = buildCanvasViewport(390, 844, 1);

    expect(viewport.width / viewport.height).toBeCloseTo(390 / 844);
    expect(viewport.width).toBeCloseTo(1100);
    expect(viewport.y).toBeLessThan(0);
    expect(viewport.canPanX).toBe(false);
    expect(viewport.canPanY).toBe(false);
  });

  it("fits a manually resized square artboard", () => {
    expect(buildCanvasViewport(600, 600, 1, 0, 0, 1000, 1000)).toMatchObject({
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
      canPanX: false,
      canPanY: false,
    });
  });

  it("clamps panning so a zoomed view cannot leave the artboard", () => {
    const topLeft = buildCanvasViewport(1100, 720, 2, -10_000, -10_000);
    const bottomRight = buildCanvasViewport(1100, 720, 2, 10_000, 10_000);

    expect(topLeft.x).toBe(0);
    expect(topLeft.y).toBe(0);
    expect(bottomRight.x + bottomRight.width).toBeCloseTo(1100);
    expect(bottomRight.y + bottomRight.height).toBeCloseTo(720);
  });

  it("constrains manual zoom values to the supported range", () => {
    expect(clampCanvasZoom(0.1)).toBe(MIN_CANVAS_ZOOM);
    expect(clampCanvasZoom(9)).toBe(MAX_CANVAS_ZOOM);
    expect(clampCanvasZoom(Number.NaN)).toBe(1);
  });

  it("starts phone portrait views at a legible inspection zoom", () => {
    expect(getInitialCanvasZoom(390, 844)).toBe(
      MOBILE_PORTRAIT_INITIAL_ZOOM,
    );
    expect(getInitialCanvasZoom(480, 800)).toBe(
      MOBILE_PORTRAIT_INITIAL_ZOOM,
    );
  });

  it("keeps desktop, tablet, and phone landscape views fitted", () => {
    expect(getInitialCanvasZoom(1440, 900)).toBe(1);
    expect(getInitialCanvasZoom(960, 768)).toBe(1);
    expect(getInitialCanvasZoom(844, 390)).toBe(1);
  });
});
