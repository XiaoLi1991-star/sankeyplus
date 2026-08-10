import { describe, expect, it } from "vitest";
import { DEFAULT_DOCUMENT } from "../data/sampleData";
import { getPalette } from "../data/palettes";
import { resolveNodeColors } from "./colors";
import { buildLabelPositions } from "./labelLayout";
import { buildPercentageSummary } from "./percentages";
import {
  buildPublicationManifest,
  buildPublicationPreflight,
  compositeOnWhite,
  contrastRatio,
  exportPixelSize,
  readableTextColor,
} from "./publication";
import { analyzeSankeyData } from "./quality";
import { buildSankeyLayout } from "./sankey";

describe("publication sizing", () => {
  it("derives pixels from physical width and DPI", () => {
    expect(exportPixelSize(90, 300)).toEqual({
      width: 1063,
      height: 696,
      physicalHeightMm: (90 * 720) / 1100,
    });
  });

  it("follows a custom canvas aspect ratio", () => {
    expect(exportPixelSize(100, 300, 1000, 1000)).toEqual({
      width: 1181,
      height: 1181,
      physicalHeightMm: 100,
    });
  });

});

describe("publication color safety", () => {
  it("chooses black or white text with the stronger contrast", () => {
    for (const color of ["#332288", "#F0E442", "#0072B2"]) {
      const background = compositeOnWhite(color, 0.92);
      expect(contrastRatio(readableTextColor(background), background)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});

describe("publication preflight", () => {
  it("warns when final labels are too small without blocking export", () => {
    const document = structuredClone(DEFAULT_DOCUMENT);
    document.exportSettings = {
      ...document.exportSettings,
      profileId: "custom",
      physicalWidthMm: 85,
      dpi: 300,
      ...exportPixelSize(85, 300),
    };
    document.settings.fontSize = 15;
    const graph = buildSankeyLayout(document.rows, document.settings, 1100, 720).graph;
    const percentages = buildPercentageSummary(graph, document.settings);
    const labels = buildLabelPositions(
      graph,
      document.settings.labelMode,
      document.settings.labelPlacement,
      document.settings.fontSize,
      document.settings.fontWeight,
      document.settings.fontStyle,
      document.settings.fontFamily,
      document.labelOverrides,
      document.labelTextOverrides,
      percentages.byNode,
      document.metadata.unit,
      document.settings.valueDecimals,
    );
    const colors = resolveNodeColors(
      graph,
      getPalette(document.settings.paletteId).colors,
      document.nodeColors,
      document.settings.nodeColorMode,
      document.settings.nodeBaseColor,
    );
    const result = buildPublicationPreflight({
      document,
      qualityReport: analyzeSankeyData(document.rows),
      labels,
      graph,
      colors,
    });

    expect(result.effectiveLabelPt).toBeLessThan(5);
    expect(
      result.issues.some(
        (item) => item.id === "label-size" && item.severity === "warning",
      ),
    ).toBe(true);
  });

  it("warns about unsafe raster output without creating an export gate", () => {
    const document = structuredClone(DEFAULT_DOCUMENT);
    document.exportSettings.profileId = "custom";
    document.exportSettings.width = 20_000;
    document.exportSettings.height = 20_000;
    const graph = buildSankeyLayout(document.rows, document.settings, 1100, 720).graph;
    const percentages = buildPercentageSummary(graph, document.settings);
    const labels = buildLabelPositions(
      graph,
      document.settings.labelMode,
      document.settings.labelPlacement,
      document.settings.fontSize,
      document.settings.fontWeight,
      document.settings.fontStyle,
      document.settings.fontFamily,
      document.labelOverrides,
      document.labelTextOverrides,
      percentages.byNode,
      document.metadata.unit,
      document.settings.valueDecimals,
    );
    const result = buildPublicationPreflight({
      document,
      qualityReport: analyzeSankeyData(document.rows),
      labels,
      graph,
      colors: resolveNodeColors(
        graph,
        getPalette(document.settings.paletteId).colors,
        document.nodeColors,
        document.settings.nodeColorMode,
        document.settings.nodeBaseColor,
      ),
    });

    expect(
      result.issues.some(
        (item) => item.id === "raster-memory" && item.severity === "warning",
      ),
    ).toBe(true);
  });

  it("keeps the semantic data hash stable when only internal row ids change", async () => {
    const document = structuredClone(DEFAULT_DOCUMENT);
    const changedIds = structuredClone(DEFAULT_DOCUMENT);
    changedIds.rows = changedIds.rows.map((row, index) => ({
      ...row,
      id: `replacement-${index}`,
    }));
    const preflight = {
      issues: [],
      warningCount: 0,
      infoCount: 0,
      effectiveLabelPt: 6,
      minimumTextPt: 5,
      physicalHeightMm: 100,
    };

    const first = await buildPublicationManifest(document, preflight, "test");
    const second = await buildPublicationManifest(changedIds, preflight, "test");
    expect(first.dataSha256).toBe(second.dataSha256);
    expect(first.documentSha256).not.toBe(second.documentSha256);
  });
});
