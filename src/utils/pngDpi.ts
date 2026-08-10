const PNG_SIGNATURE_LENGTH = 8;

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) {
    current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }
  return current >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
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

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const result = new Uint8Array(12 + data.length);
  writeUint32(result, 0, data.length);
  result.set(typeBytes, 4);
  result.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  writeUint32(result, 8 + data.length, crc32(crcInput));
  return result;
}

export function pngBytesWithDpi(source: Uint8Array, dpi: number): Uint8Array {
  if (source.length < PNG_SIGNATURE_LENGTH + 12) {
    throw new Error("PNG 文件不完整，无法写入 DPI。");
  }
  const pixelsPerMeter = Math.round(Math.max(1, dpi) / 0.0254);
  const physical = new Uint8Array(9);
  writeUint32(physical, 0, pixelsPerMeter);
  writeUint32(physical, 4, pixelsPerMeter);
  physical[8] = 1;
  const physicalChunk = chunk("pHYs", physical);

  const parts: Uint8Array[] = [source.slice(0, PNG_SIGNATURE_LENGTH)];
  let offset = PNG_SIGNATURE_LENGTH;
  let inserted = false;
  while (offset + 12 <= source.length) {
    const length = readUint32(source, offset);
    const end = offset + 12 + length;
    if (end > source.length) throw new Error("PNG 数据块长度无效。");
    const type = new TextDecoder().decode(source.slice(offset + 4, offset + 8));
    if (type !== "pHYs") parts.push(source.slice(offset, end));
    if (type === "IHDR" && !inserted) {
      parts.push(physicalChunk);
      inserted = true;
    }
    offset = end;
  }
  if (!inserted) throw new Error("PNG 缺少 IHDR 数据块。");

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  parts.forEach((part) => {
    output.set(part, cursor);
    cursor += part.length;
  });
  return output;
}

export async function pngBlobWithDpi(blob: Blob, dpi: number): Promise<Blob> {
  const source = new Uint8Array(await blob.arrayBuffer());
  const bytes = pngBytesWithDpi(source, dpi);
  const buffer = bytes.slice().buffer as ArrayBuffer;
  return new Blob([buffer], { type: "image/png" });
}
