/**
 * Generates the icon set from Taylor's Figma mark
 * (public/brand/icon-source.png — 512x512, the surfer knocked out of an
 * angular rainbow with rounded corners), exported from the Wright
 * Angles file, node 179-2.
 *
 * Small sizes are just clean downsamples: the mark is already designed
 * to read at favicon scale, so nothing is recomposed here.
 *
 * Run: bun scripts/generate-favicon.ts
 */
import sharp from "sharp";

const source = Buffer.from(
  await Bun.file("./public/brand/icon-source.png").arrayBuffer(),
);

const icon = (size: number) =>
  sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

/**
 * KNOWN GAP — the Apple touch icon wants a full-bleed SQUARE source.
 * iOS applies its own superellipse mask and composites transparency
 * onto black, so our pre-rounded corners can show as dark ghosting
 * outside Apple's curve when the site is added to a home screen.
 *
 * Synthesising a square from the rounded art (edge-replication, zoomed
 * backdrops) smears the silhouette, so this stays a plain downsample
 * until a radius-0 variant is exported from the Figma frame — then
 * point `appleSource` at it.
 */
const appleSource = source;

await Bun.write("./app/icon.png", await icon(512));
await Bun.write(
  "./app/apple-icon.png",
  await sharp(appleSource).resize(180, 180).png().toBuffer(),
);
await Bun.write("./public/favicon-32.png", await icon(32));

console.log(
  "icons written:",
  ["app/icon.png", "app/apple-icon.png", "public/favicon-32.png"].join(", "),
);
