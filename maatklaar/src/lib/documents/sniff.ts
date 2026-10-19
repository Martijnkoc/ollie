/** File type detection by content (magic bytes), never by extension. Pure, works in browser and Node. */

export type FileKind = "pdf" | "png" | "jpeg" | "webp";

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

export function sniffKind(bytes: Uint8Array): FileKind | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  // The PDF header may be preceded by a little junk; readers accept it within the first 1024 bytes.
  const head = ascii(bytes, 0, Math.min(bytes.length, 1024));
  if (head.includes("%PDF-")) return "pdf";
  return null;
}

/**
 * Reads pixel dimensions from the image header without decoding the image, so an oversized image
 * (a "decompression bomb") can be refused before the browser allocates memory for it.
 */
export function imageDimensions(bytes: Uint8Array, kind: Exclude<FileKind, "pdf">): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (kind === "png") {
      if (ascii(bytes, 12, 4) !== "IHDR") return null;
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (kind === "jpeg") {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) return null;
        const marker = bytes[i + 1]!;
        if (marker === 0xff) {
          i++;
          continue;
        }
        // Standalone markers without a length field.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        const length = view.getUint16(i + 2);
        const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
        i += 2 + length;
      }
      return null;
    }
    // WEBP: first chunk decides the layout.
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const b = view.getUint32(21, true);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      const w = bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16);
      const h = bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16);
      return { width: w + 1, height: h + 1 };
    }
    return null;
  } catch {
    return null;
  }
}
