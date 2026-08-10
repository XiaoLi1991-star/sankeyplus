import { describe, expect, it } from "vitest";
import { pngBytesWithDpi } from "./pngDpi";

function minimalPngBytes(): Uint8Array {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr = [
    0, 0, 0, 13,
    73, 72, 68, 82,
    ...new Array(13).fill(0),
    0, 0, 0, 0,
  ];
  const iend = [0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0];
  return Uint8Array.from([...signature, ...ihdr, ...iend]);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

describe("PNG DPI metadata", () => {
  it("writes a pHYs chunk using pixels per metre", () => {
    const result = pngBytesWithDpi(minimalPngBytes(), 300);
    const typeOffset = new TextDecoder().decode(result).indexOf("pHYs");

    expect(typeOffset).toBeGreaterThan(0);
    expect(readUint32(result, typeOffset + 4)).toBe(Math.round(300 / 0.0254));
    expect(readUint32(result, typeOffset + 8)).toBe(Math.round(300 / 0.0254));
    expect(result[typeOffset + 12]).toBe(1);
  });

  it("replaces an existing pHYs chunk instead of duplicating it", () => {
    const first = pngBytesWithDpi(minimalPngBytes(), 300);
    const second = pngBytesWithDpi(first, 600);
    const decoded = new TextDecoder().decode(second);

    expect(decoded.split("pHYs")).toHaveLength(2);
    const typeOffset = decoded.indexOf("pHYs");
    expect(readUint32(second, typeOffset + 4)).toBe(Math.round(600 / 0.0254));
  });
});
