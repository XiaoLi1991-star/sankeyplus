import { describe, expect, it } from "vitest";
import { encodeRgbaTiff } from "./tiff";

function findEntry(bytes: Uint8Array, tag: number) {
  const view = new DataView(bytes.buffer);
  const ifdOffset = view.getUint32(4, true);
  const count = view.getUint16(ifdOffset, true);
  for (let index = 0; index < count; index += 1) {
    const offset = ifdOffset + 2 + index * 12;
    if (view.getUint16(offset, true) === tag) return offset;
  }
  return -1;
}

describe("TIFF export", () => {
  it("writes dimensions, RGBA pixels and physical DPI", () => {
    const bytes = encodeRgbaTiff(
      2,
      1,
      Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]),
      500,
    );
    const view = new DataView(bytes.buffer);

    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("II");
    expect(view.getUint16(2, true)).toBe(42);
    const widthEntry = findEntry(bytes, 256);
    const heightEntry = findEntry(bytes, 257);
    const resolutionEntry = findEntry(bytes, 282);
    expect(view.getUint32(widthEntry + 8, true)).toBe(2);
    expect(view.getUint32(heightEntry + 8, true)).toBe(1);
    const resolutionOffset = view.getUint32(resolutionEntry + 8, true);
    expect(view.getUint32(resolutionOffset, true)).toBe(500);
    expect(view.getUint32(resolutionOffset + 4, true)).toBe(1);
  });
});
