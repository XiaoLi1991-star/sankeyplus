import { describe, expect, it } from "vitest";
import { DEFAULT_DOCUMENT, DEFAULT_SETTINGS } from "../data/sampleData";
import type { SankeySettings } from "../types";
import { normalizeDocument } from "./useSankeyDocument";

describe("normalizeDocument", () => {
  it("fills typography defaults in documents saved by older versions", () => {
    const legacy = structuredClone(DEFAULT_DOCUMENT);
    const settings = legacy.settings as Partial<SankeySettings>;
    delete settings.fontFamily;
    delete settings.fontColor;
    delete settings.labelColorMode;
    delete settings.fontWeight;
    delete settings.fontStyle;
    delete settings.nodeColorMode;
    delete settings.nodeBaseColor;

    const normalized = normalizeDocument(
      legacy as Parameters<typeof normalizeDocument>[0],
    );

    expect(normalized.settings.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
    expect(normalized.settings.fontColor).toBe(DEFAULT_SETTINGS.fontColor);
    expect(normalized.settings.labelColorMode).toBe("fixed");
    expect(normalized.settings.fontWeight).toBe(DEFAULT_SETTINGS.fontWeight);
    expect(normalized.settings.fontStyle).toBe(DEFAULT_SETTINGS.fontStyle);
    expect(normalized.settings.nodeColorMode).toBe(
      DEFAULT_DOCUMENT.settings.nodeColorMode,
    );
    expect(normalized.settings.nodeBaseColor).toBe(
      DEFAULT_DOCUMENT.settings.nodeBaseColor,
    );
  });

  it("replaces an invalid saved font color with the default", () => {
    const document = structuredClone(DEFAULT_DOCUMENT);
    document.settings.fontColor = "not-a-color";

    expect(normalizeDocument(document).settings.fontColor).toBe(
      DEFAULT_SETTINGS.fontColor,
    );
  });

  it("migrates a version 1 document to the reproducible version 8 schema", () => {
    const legacy = structuredClone(DEFAULT_DOCUMENT) as unknown as {
      schemaVersion: number;
      metadata?: unknown;
      exportSettings?: unknown;
      nodeColors?: unknown;
      settings?: Record<string, unknown>;
    };
    legacy.schemaVersion = 1;
    delete legacy.metadata;
    delete legacy.exportSettings;
    delete legacy.nodeColors;
    delete legacy.settings?.labelPlacement;
    delete legacy.settings?.canvasWidth;
    delete legacy.settings?.canvasHeight;
    delete legacy.settings?.leaderLineThresholdPx;

    const normalized = normalizeDocument(
      legacy as Parameters<typeof normalizeDocument>[0],
    );

    expect(normalized.schemaVersion).toBe(8);
    expect(normalized.metadata.unit).toBe("");
    expect(normalized.exportSettings.width).toBeGreaterThan(1000);
    expect(normalized.exportSettings.physicalWidthMm).toBeGreaterThan(100);
    expect(normalized.exportSettings.dpi).toBe(300);
    expect(normalized.nodeColors).toEqual({});
    expect(normalized.labelColorOverrides).toEqual({});
    expect(normalized.settings.labelPlacement).toBe("outside");
    expect(normalized.settings.canvasWidth).toBe(1100);
    expect(normalized.settings.canvasHeight).toBe(720);
    expect(normalized.settings.leaderLineThresholdPx).toBe(20);
  });

  it("clamps the leader-line movement threshold to the supported range", () => {
    const document = structuredClone(DEFAULT_DOCUMENT);
    document.settings.leaderLineThresholdPx = 240;

    expect(normalizeDocument(document).settings.leaderLineThresholdPx).toBe(200);

    document.settings.leaderLineThresholdPx = -8;
    expect(normalizeDocument(document).settings.leaderLineThresholdPx).toBe(0);
  });

  it("drops legacy project fields and embedded metadata export settings", () => {
    const legacy = structuredClone(DEFAULT_DOCUMENT) as unknown as Record<
      string,
      unknown
    >;
    legacy.schemaVersion = 6;
    legacy.metadata = {
      unit: "kg",
      dataSource: "legacy.csv",
      analysisDate: "2026-01-01",
      note: "legacy note",
    };
    legacy.exportSettings = {
      ...(legacy.exportSettings as Record<string, unknown>),
      profileId: "nature-double",
      includeMetadata: true,
      metadataFontSizePt: 5.5,
      includeTitle: true,
      titleFontSizePt: 9,
    };

    const normalized = normalizeDocument(
      legacy as Parameters<typeof normalizeDocument>[0],
    );

    expect(normalized.schemaVersion).toBe(8);
    expect(normalized.metadata).toEqual({ unit: "kg" });
    expect(normalized.exportSettings).not.toHaveProperty("includeMetadata");
    expect(normalized.exportSettings).not.toHaveProperty("metadataFontSizePt");
    expect(normalized.exportSettings).not.toHaveProperty("includeTitle");
    expect(normalized.exportSettings).not.toHaveProperty("titleFontSizePt");
    expect(normalized.exportSettings.profileId).toBe("custom");
  });

  it("normalizes custom canvas dimensions and updates the export aspect ratio", () => {
    const document = structuredClone(DEFAULT_DOCUMENT);
    document.settings.canvasWidth = 1000;
    document.settings.canvasHeight = 1000;

    const normalized = normalizeDocument(document);

    expect(normalized.settings.canvasWidth).toBe(1000);
    expect(normalized.settings.canvasHeight).toBe(1000);
    expect(normalized.exportSettings.width).toBe(normalized.exportSettings.height);
  });

  it("rejects an unsupported label placement", () => {
    const document = structuredClone(DEFAULT_DOCUMENT) as unknown as Record<
      string,
      unknown
    >;
    document.settings = {
      ...(document.settings as Record<string, unknown>),
      labelPlacement: "floating",
    };

    expect(() =>
      normalizeDocument(document as Parameters<typeof normalizeDocument>[0]),
    ).toThrow("settings.labelPlacement");
  });

  it("rejects every invalid row instead of silently dropping it", () => {
    const document = structuredClone(DEFAULT_DOCUMENT) as unknown as Record<string, unknown>;
    document.rows = [
      { id: "ok", source: "A", target: "B", value: 10 },
      { id: "bad", source: "A", target: "C", value: "5" },
    ];

    expect(() =>
      normalizeDocument(document as Parameters<typeof normalizeDocument>[0]),
    ).toThrow("rows 第 2 行的 value 必须是有限数值");
  });

  it("rejects invalid metadata types before they can crash the page", () => {
    const document = structuredClone(DEFAULT_DOCUMENT) as unknown as Record<string, unknown>;
    document.metadata = { unit: 42 };

    expect(() =>
      normalizeDocument(document as Parameters<typeof normalizeDocument>[0]),
    ).toThrow("metadata.unit 必须是字符串");
  });

  it("preserves optional generic node and link groups", () => {
    const document = structuredClone(DEFAULT_DOCUMENT);
    document.rows[0] = {
      ...document.rows[0],
      sourceGroup: "入口",
      targetGroup: "处理中",
      linkGroup: "路径 A",
    };

    expect(normalizeDocument(document).rows[0]).toMatchObject({
      sourceGroup: "入口",
      targetGroup: "处理中",
      linkGroup: "路径 A",
    });
  });
});
