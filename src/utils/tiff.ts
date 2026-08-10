const TIFF_TYPE_SHORT = 3;
const TIFF_TYPE_LONG = 4;
const TIFF_TYPE_RATIONAL = 5;
const TIFF_TYPE_ASCII = 2;

interface TiffEntry {
  tag: number;
  type: number;
  count: number;
  value: number;
  inlineShort?: boolean;
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

export function encodeRgbaTiff(
  width: number,
  height: number,
  pixels: Uint8ClampedArray | Uint8Array,
  dpi: number,
): Uint8Array {
  const pixelCount = width * height;
  const samplesPerPixel = pixels.length === pixelCount * 3 ? 3 : 4;
  if (
    width <= 0 ||
    height <= 0 ||
    (pixels.length !== pixelCount * 3 && pixels.length !== pixelCount * 4)
  ) {
    throw new Error("TIFF 像素尺寸无效。");
  }

  const software = new TextEncoder().encode("SankeyPlus 0.3.0\0");
  const entryCount = samplesPerPixel === 4 ? 15 : 14;
  const ifdOffset = 8;
  const ifdSize = 2 + entryCount * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize;
  const xResolutionOffset = bitsOffset + samplesPerPixel * 2;
  const yResolutionOffset = xResolutionOffset + 8;
  const softwareOffset = yResolutionOffset + 8;
  const pixelOffset = align4(softwareOffset + software.length);
  const output = new Uint8Array(pixelOffset + pixels.length);
  const view = new DataView(output.buffer);

  output[0] = 0x49;
  output[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  const entries: TiffEntry[] = [
    { tag: 256, type: TIFF_TYPE_LONG, count: 1, value: width },
    { tag: 257, type: TIFF_TYPE_LONG, count: 1, value: height },
    {
      tag: 258,
      type: TIFF_TYPE_SHORT,
      count: samplesPerPixel,
      value: bitsOffset,
    },
    { tag: 259, type: TIFF_TYPE_SHORT, count: 1, value: 1, inlineShort: true },
    { tag: 262, type: TIFF_TYPE_SHORT, count: 1, value: 2, inlineShort: true },
    { tag: 273, type: TIFF_TYPE_LONG, count: 1, value: pixelOffset },
    {
      tag: 277,
      type: TIFF_TYPE_SHORT,
      count: 1,
      value: samplesPerPixel,
      inlineShort: true,
    },
    { tag: 278, type: TIFF_TYPE_LONG, count: 1, value: height },
    { tag: 279, type: TIFF_TYPE_LONG, count: 1, value: pixels.length },
    { tag: 282, type: TIFF_TYPE_RATIONAL, count: 1, value: xResolutionOffset },
    { tag: 283, type: TIFF_TYPE_RATIONAL, count: 1, value: yResolutionOffset },
    { tag: 284, type: TIFF_TYPE_SHORT, count: 1, value: 1, inlineShort: true },
    {
      tag: 296,
      type: TIFF_TYPE_SHORT,
      count: 1,
      value: 2,
      inlineShort: true,
    },
    { tag: 305, type: TIFF_TYPE_ASCII, count: software.length, value: softwareOffset },
    ...(samplesPerPixel === 4
      ? [
          {
            tag: 338,
            type: TIFF_TYPE_SHORT,
            count: 1,
            value: 2,
            inlineShort: true,
          },
        ]
      : []),
  ].sort((left, right) => left.tag - right.tag);

  view.setUint16(ifdOffset, entries.length, true);
  entries.forEach((entry, index) => {
    const offset = ifdOffset + 2 + index * 12;
    view.setUint16(offset, entry.tag, true);
    view.setUint16(offset + 2, entry.type, true);
    view.setUint32(offset + 4, entry.count, true);
    if (entry.inlineShort) {
      view.setUint16(offset + 8, entry.value, true);
      view.setUint16(offset + 10, 0, true);
    } else {
      view.setUint32(offset + 8, entry.value, true);
    }
  });
  view.setUint32(ifdOffset + 2 + entries.length * 12, 0, true);

  Array.from({ length: samplesPerPixel }).forEach((_, index) =>
    view.setUint16(bitsOffset + index * 2, 8, true),
  );
  const safeDpi = Math.max(1, Math.round(dpi));
  view.setUint32(xResolutionOffset, safeDpi, true);
  view.setUint32(xResolutionOffset + 4, 1, true);
  view.setUint32(yResolutionOffset, safeDpi, true);
  view.setUint32(yResolutionOffset + 4, 1, true);
  output.set(software, softwareOffset);
  output.set(pixels, pixelOffset);
  return output;
}
