import { describe, expect, test } from "bun:test";
import { formatBytes, probeImageDetails } from "@/lib/image-details";

/** Big-endian helpers for hand-built headers. */
const u16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const u32 = (v: number) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A JPEG with one SOF marker carrying the given sampling factors. */
/** A minimal ICC v2 profile: 128-byte header, one `desc` tag. */
function iccProfile(name: string) {
  const header = new Array(128).fill(0);
  const tagTable = [...u32(1), ...ascii("desc"), ...u32(128 + 4 + 12), ...u32(12 + name.length + 1)];
  const desc = [...ascii("desc"), 0, 0, 0, 0, ...u32(name.length + 1), ...ascii(name), 0];
  return [...header, ...tagTable, ...desc];
}

function jpeg(opts: {
  progressive?: boolean;
  y: number;
  cb: number;
  icc?: boolean;
  iccName?: string;
}) {
  const bytes = [0xff, 0xd8];
  if (opts.icc) {
    const profile = opts.iccName ? iccProfile(opts.iccName) : [0, 0, 0, 0];
    const payload = [...ascii("ICC_PROFILE"), 0, 1, 1, ...profile];
    bytes.push(0xff, 0xe2, ...u16(payload.length + 2), ...payload);
  }
  const sof = [
    8, // precision
    ...u16(1080),
    ...u16(1920),
    3,
    1, opts.y, 0,
    2, opts.cb, 1,
    3, opts.cb, 1,
  ];
  bytes.push(0xff, opts.progressive ? 0xc2 : 0xc0, ...u16(sof.length + 2), ...sof);
  bytes.push(0xff, 0xda); // start of scan
  return new Blob([new Uint8Array(bytes)]);
}

function png(opts: { colorType: number; bitDepth?: number; chunks?: number[][] }) {
  const ihdrData = [...u32(1920), ...u32(1080), opts.bitDepth ?? 8, opts.colorType, 0, 0, 0];
  const chunk = (type: string, data: number[]) => [
    ...u32(data.length),
    ...ascii(type),
    ...data,
    0, 0, 0, 0, // crc (unchecked)
  ];
  const bytes = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", ihdrData),
    ...(opts.chunks ?? []).flat(),
    ...chunk("IDAT", []),
  ];
  return { blob: new Blob([new Uint8Array(bytes)]), chunk };
}

describe("probeImageDetails", () => {
  test("JPEG 4:2:0 baseline", async () => {
    const d = await probeImageDetails(jpeg({ y: 0x22, cb: 0x11 }));
    expect(d.format).toBe("JPEG");
    expect(d.chromaSubsampling).toBe("4:2:0");
    expect(d.progressive).toBe(false);
    expect(d.bitDepth).toBe(8);
    expect(d.colorMode).toBe("YCbCr (RGB)");
    expect(d.colorSpace).toMatch(/sRGB assumed/);
  });

  test("JPEG 4:4:4 progressive with an ICC profile", async () => {
    const d = await probeImageDetails(jpeg({ y: 0x11, cb: 0x11, progressive: true, icc: true }));
    expect(d.chromaSubsampling).toBe("4:4:4");
    expect(d.progressive).toBe(true);
    expect(d.colorSpace).toBe("ICC profile embedded");
  });

  test("JPEG names its ICC profile from the desc tag", async () => {
    const d = await probeImageDetails(jpeg({ y: 0x11, cb: 0x11, icc: true, iccName: "Display P3" }));
    expect(d.colorSpace).toBe("ICC: Display P3");
  });

  test("JPEG 4:2:2", async () => {
    const d = await probeImageDetails(jpeg({ y: 0x21, cb: 0x11 }));
    expect(d.chromaSubsampling).toBe("4:2:2");
  });

  test("PNG RGB+alpha, sRGB tagged", async () => {
    const built = png({ colorType: 6 });
    const tagged = png({ colorType: 6, chunks: [built.chunk("sRGB", [0])] });
    const d = await probeImageDetails(tagged.blob);
    expect(d.format).toBe("PNG");
    expect(d.colorMode).toBe("RGB + alpha");
    expect(d.bitDepth).toBe(8);
    expect(d.colorSpace).toBe("sRGB (tagged)");
    expect(d.chromaSubsampling).toBeNull();
  });

  test("PNG with only a gAMA chunk reports the gamma", async () => {
    const built = png({ colorType: 2 });
    const g = png({ colorType: 2, chunks: [built.chunk("gAMA", u32(100000))] });
    const d = await probeImageDetails(g.blob);
    expect(d.colorSpace).toBe("Untagged (gamma 1.00)");
  });

  test("PNG iCCP wins over sRGB", async () => {
    const built = png({ colorType: 2 });
    const p = png({
      colorType: 2,
      chunks: [
        built.chunk("iCCP", [...ascii("Display P3"), 0, 0]),
        built.chunk("sRGB", [0]),
      ],
    });
    const d = await probeImageDetails(p.blob);
    expect(d.colorSpace).toBe("ICC: Display P3");
  });

  test("WebP: lossless is 4:4:4, lossy is always 4:2:0", async () => {
    const riff = (fourcc: string) =>
      new Blob([
        new Uint8Array([
          ...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii(fourcc),
          0, 0, 0, 0, 0, 0, 0, 0,
        ]),
      ]);
    const lossless = await probeImageDetails(riff("VP8L"));
    expect(lossless.format).toBe("WebP");
    expect(lossless.colorMode).toBe("RGB(A), lossless");
    expect(lossless.chromaSubsampling).toBe("4:4:4");
    const lossy = await probeImageDetails(riff("VP8 "));
    expect(lossy.colorMode).toBe("RGB(A), lossy");
    expect(lossy.chromaSubsampling).toBe("4:2:0");
    const extended = await probeImageDetails(riff("VP8X"));
    expect(extended.chromaSubsampling).toBeNull();
  });

  test("unknown bytes fall back to the MIME type", async () => {
    const d = await probeImageDetails(new Blob([new Uint8Array(32)], { type: "image/avif" }));
    expect(d.format).toBe("AVIF");
    expect(d.bitDepth).toBeNull();
  });
});

test("formatBytes", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(19300)).toBe("18.8 KB");
  expect(formatBytes(845576)).toBe("825.8 KB");
  expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
});
