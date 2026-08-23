/**
 * Header-level image inspection, entirely client-side: format from magic
 * bytes and color mode / bit depth from the PNG IHDR or JPEG SOF marker.
 * Everything degrades to what the browser told us (MIME) when a format
 * isn't parsed.
 */

export interface ImageDetails {
  format: string;
  colorMode: string;
  bitDepth: number | null;
  progressive: boolean | null;
}

const PNG_COLOR_TYPES: Record<number, string> = {
  0: "Grayscale",
  2: "RGB",
  3: "Indexed",
  4: "Grayscale + alpha",
  6: "RGB + alpha",
};

function pngDetails(v: DataView): ImageDetails | null {
  // 8-byte signature, then the IHDR chunk: length(4) "IHDR"(4) w(4) h(4)
  // bitDepth(1) colorType(1).
  if (v.byteLength < 26 || v.getUint32(0) !== 0x89504e47) return null;
  const bitDepth = v.getUint8(24);
  const colorType = v.getUint8(25);
  return {
    format: "PNG",
    colorMode: PNG_COLOR_TYPES[colorType] ?? `Type ${colorType}`,
    bitDepth,
    progressive: null,
  };
}

function jpegDetails(v: DataView): ImageDetails | null {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= v.byteLength) {
    if (v.getUint8(offset) !== 0xff) break;
    const marker = v.getUint8(offset + 1);
    // SOF0 (baseline), SOF1 (extended), SOF2 (progressive)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const precision = v.getUint8(offset + 4);
      const components = v.getUint8(offset + 9);
      const mode =
        components === 1
          ? "Grayscale"
          : components === 3
            ? "YCbCr (RGB)"
            : components === 4
              ? "CMYK"
              : `${components} channels`;
      return {
        format: "JPEG",
        colorMode: mode,
        bitDepth: precision,
        progressive: marker === 0xc2,
      };
    }
    offset += 2 + v.getUint16(offset + 2);
  }
  return { format: "JPEG", colorMode: "—", bitDepth: null, progressive: null };
}

function riffDetails(v: DataView): ImageDetails | null {
  if (v.byteLength < 16 || v.getUint32(0) !== 0x52494646) return null; // RIFF
  if (v.getUint32(8) !== 0x57454250) return null; // WEBP
  const chunk = String.fromCharCode(
    v.getUint8(12),
    v.getUint8(13),
    v.getUint8(14),
    v.getUint8(15),
  );
  const kind =
    chunk === "VP8L" ? "lossless" : chunk === "VP8X" ? "extended" : "lossy";
  return {
    format: "WebP",
    colorMode: `RGB(A), ${kind}`,
    bitDepth: 8,
    progressive: null,
  };
}

function gifDetails(v: DataView): ImageDetails | null {
  if (v.byteLength < 6 || v.getUint32(0) !== 0x47494638) return null; // GIF8
  return { format: "GIF", colorMode: "Indexed", bitDepth: 8, progressive: null };
}

export async function probeImageDetails(blob: Blob): Promise<ImageDetails> {
  const buf = await blob.slice(0, 64 * 1024).arrayBuffer();
  const v = new DataView(buf);
  const parsed =
    pngDetails(v) ?? jpegDetails(v) ?? riffDetails(v) ?? gifDetails(v);
  if (parsed) return parsed;
  const fromMime = blob.type.replace("image/", "").toUpperCase() || "Unknown";
  return { format: fromMime, colorMode: "—", bitDepth: null, progressive: null };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
