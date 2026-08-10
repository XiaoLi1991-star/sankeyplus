import { describe, expect, it } from "vitest";
import { getLabelFontStack, LABEL_FONT_OPTIONS } from "./fonts";

describe("label fonts", () => {
  it("offers common sans, serif and monospaced research fonts", () => {
    expect(LABEL_FONT_OPTIONS.map((font) => font.id)).toEqual([
      "sans",
      "arial",
      "serif",
      "times",
      "georgia",
      "mono",
    ]);
  });

  it("returns an export-safe fallback stack", () => {
    expect(getLabelFontStack("times")).toContain("Times New Roman");
    expect(getLabelFontStack("times")).toContain("serif");
  });
});
