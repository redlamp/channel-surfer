/**
 * OG variant: linear rainbow backdrop, CHANNEL SURFER in the project's
 * Share Tech Mono (converted to SVG paths via opentype.js so sharp
 * doesn't need the font installed), and the surfer emoji image from
 * public/brand/surfer.png composited large above the wordmark (falls
 * back to the monochrome glyph if the file is missing).
 *
 * Run: bun scripts/generate-og-linear.ts
 */
import sharp, { type OverlayOptions } from "sharp";
import { parse } from "opentype.js";

const W = 1200;
const H = 630;

const fontBuf = await Bun.file(
  "./node_modules/@fontsource/share-tech-mono/files/share-tech-mono-latin-400-normal.woff",
).arrayBuffer();
const font = parse(fontBuf);

/** Centered text as an SVG path in Share Tech Mono. */
function textPath(
  text: string,
  centerX: number,
  baselineY: number,
  size: number,
  letterSpacing = 0,
) {
  const base = font.getAdvanceWidth(text, size);
  const width = base + letterSpacing * (text.length - 1);
  let x = centerX - width / 2;
  const parts: string[] = [];
  for (const ch of text) {
    const p = font.getPath(ch, x, baselineY, size);
    parts.push(p.toPathData(2));
    x += font.getAdvanceWidth(ch, size) + letterSpacing;
  }
  return parts.join(" ");
}

const title = textPath("CHANNEL SURFER", W / 2, 540, 104, 6);

const surferFile = Bun.file("./public/brand/surfer.png");
const hasSurfer = await surferFile.exists();

const svg = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    (hasSurfer
      ? ""
      : `<text x="600" y="330" text-anchor="middle" font-size="280" font-family="Segoe UI Emoji">\u{1F3C4}</text>`) +
    // Outline drawn as its own path underneath the fill: librsvg's
    // paint-order support is unreliable, which let the stroke chew into
    // the glyph fills.
    `<path d="${title}" fill="none" stroke="#000000" stroke-width="12" stroke-linejoin="round"/>` +
    `<path d="${title}" fill="#ffffff"/>` +
    `</svg>`,
);

const layers: OverlayOptions[] = [];
if (hasSurfer) {
  const surfer = await sharp(Buffer.from(await surferFile.arrayBuffer()))
    .resize(380, 380, { fit: "inside" })
    .png()
    .toBuffer();
  const meta = await sharp(surfer).metadata();
  layers.push({
    input: surfer,
    left: Math.round(W / 2 - (meta.width ?? 380) / 2),
    top: 40,
  });
}
layers.push({ input: svg });

const src = await Bun.file("./public/demo/linear-rainbow.webp").arrayBuffer();
await sharp(Buffer.from(src))
  .resize(W, H, { fit: "cover" })
  .composite(layers)
  .png()
  .toFile("./public/og-linear.png");
console.log(
  hasSurfer ? "with surfer image" : "glyph fallback",
  (Bun.file("./public/og-linear.png").size / 1024).toFixed(0) + "KB",
);
