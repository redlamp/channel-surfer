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
  /** Tagged color space / profile, or the sRGB assumption note. */
  colorSpace: string;
  /** JPEG chroma subsampling ("4:4:4" | "4:2:2" | "4:2:0" | …), or null
   * when the format doesn't subsample / doesn't say. Anything other than
   * 4:4:4 means the file stores colour at reduced resolution — the
   * source of block artifacts on the hue-family tiles. */
  chromaSubsampling: string | null;
}

const UNTAGGED = "Untagged (sRGB assumed)";

/** Scan PNG chunks for color-space tags: iCCP beats sRGB beats gAMA. */
function pngColorSpace(v: DataView): string {
  let offset = 8;
  let gamma: number | null = null;
  let srgbTagged = false;
  while (offset + 8 <= v.byteLength) {
    const len = v.getUint32(offset);
    const type = String.fromCharCode(
      v.getUint8(offset + 4),
      v.getUint8(offset + 5),
      v.getUint8(offset + 6),
      v.getUint8(offset + 7),
    );
    if (type === "IDAT" || type === "IEND") break;
    const dataStart = offset + 8;
    if (type === "iCCP" && dataStart < v.byteLength) {
      let name = "";
      for (let i = dataStart; i < Math.min(dataStart + 79, v.byteLength); i++) {
        const c = v.getUint8(i);
        if (c === 0) break;
        name += String.fromCharCode(c);
      }
      return `ICC: ${name || "embedded profile"}`;
    }
    if (type === "sRGB") srgbTagged = true;
    if (type === "gAMA" && dataStart + 4 <= v.byteLength)
      gamma = v.getUint32(dataStart) / 100000;
    offset = dataStart + len + 4;
  }
  if (srgbTagged) return "sRGB (tagged)";
  if (gamma !== null) return `Untagged (gamma ${gamma.toFixed(2)})`;
  return UNTAGGED;
}

/** Look for an APP2 ICC_PROFILE marker in a JPEG. */
function jpegColorSpace(v: DataView): string {
  let offset = 2;
  while (offset + 4 <= v.byteLength) {
    if (v.getUint8(offset) !== 0xff) break;
    const marker = v.getUint8(offset + 1);
    if (marker === 0xda) break; // start of scan
    if (marker === 0xe2 && offset + 15 <= v.byteLength) {
      const sig = String.fromCharCode(
        ...Array.from({ length: 11 }, (_, i) => v.getUint8(offset + 4 + i)),
      );
      if (sig === "ICC_PROFILE") return "ICC profile embedded";
    }
    offset += 2 + v.getUint16(offset + 2);
  }
  return UNTAGGED;
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
    colorSpace: pngColorSpace(v),
    chromaSubsampling: null,
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
      // Per-component sampling factors follow (3 bytes each: id,
      // H<<4|V, quant table). Y's factors relative to Cb's give the
      // J:a:b subsampling — 4:2:0 stores one colour sample per 2x2
      // luma pixels.
      let subsampling: string | null = null;
      if (components === 3 && offset + 10 + 3 * 3 <= v.byteLength) {
        const samp = (i: number) => v.getUint8(offset + 10 + i * 3 + 1);
        const y = samp(0);
        const cb = samp(1);
        const rh = (y >> 4) / (cb >> 4 || 1);
        const rv = (y & 0xf) / (cb & 0xf || 1);
        subsampling =
          rh === 1 && rv === 1
            ? "4:4:4"
            : rh === 2 && rv === 1
              ? "4:2:2"
              : rh === 2 && rv === 2
                ? "4:2:0"
                : rh === 1 && rv === 2
                  ? "4:4:0"
                  : rh === 4 && rv === 1
                    ? "4:1:1"
                    : `${y >> 4}×${y & 0xf} / ${cb >> 4}×${cb & 0xf}`;
      }
      return {
        format: "JPEG",
        colorMode: mode,
        bitDepth: precision,
        progressive: marker === 0xc2,
        colorSpace: jpegColorSpace(v),
        chromaSubsampling: subsampling,
      };
    }
    offset += 2 + v.getUint16(offset + 2);
  }
  return {
    format: "JPEG",
    colorMode: "—",
    bitDepth: null,
    progressive: null,
    colorSpace: jpegColorSpace(v),
    chromaSubsampling: null,
  };
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
  // VP8X flags byte: bit 5 marks an embedded ICC profile.
  const hasIcc =
    chunk === "VP8X" && v.byteLength > 20 && (v.getUint8(20) & 0x20) !== 0;
  return {
    format: "WebP",
    colorMode: `RGB(A), ${kind}`,
    bitDepth: 8,
    progressive: null,
    colorSpace: hasIcc ? "ICC profile embedded" : UNTAGGED,
    chromaSubsampling: null,
  };
}

function gifDetails(v: DataView): ImageDetails | null {
  if (v.byteLength < 6 || v.getUint32(0) !== 0x47494638) return null; // GIF8
  return {
    format: "GIF",
    colorMode: "Indexed",
    bitDepth: 8,
    progressive: null,
    colorSpace: UNTAGGED,
    chromaSubsampling: null,
  };
}

export async function probeImageDetails(blob: Blob): Promise<ImageDetails> {
  const buf = await blob.slice(0, 64 * 1024).arrayBuffer();
  const v = new DataView(buf);
  const parsed =
    pngDetails(v) ?? jpegDetails(v) ?? riffDetails(v) ?? gifDetails(v);
  if (parsed) return parsed;
  const fromMime = blob.type.replace("image/", "").toUpperCase() || "Unknown";
  return {
    format: fromMime,
    colorMode: "—",
    bitDepth: null,
    progressive: null,
    colorSpace: UNTAGGED,
    chromaSubsampling: null,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
