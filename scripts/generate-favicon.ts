/**
 * Generates the icon set from one master: public/brand/icon-square.png
 * — Taylor's "Channel Surfer Icon-Square" frame (Wright Angles file,
 * node 179-8), 512x512, full-bleed, radius 0.
 *
 * Square is the master because rounding is additive: every consumer
 * either wants square art or can round it, but nothing can un-round a
 * pre-rounded source.
 *
 *   app/icon.png, public/favicon-32.png  rounded here (browsers paint
 *                                        favicons as-is, no mask)
 *   app/apple-icon.png                   left square — iOS applies its
 *                                        own superellipse mask and
 *                                        composites transparency onto
 *                                        black, so pre-rounded corners
 *                                        ghost dark on a home screen
 *   public/brand/icon-40.png             rounded, for the 20px header
 *                                        mark at 2x (the 512px master
 *                                        was 130KB for a 20px slot)
 *
 * Run: bun scripts/generate-favicon.ts
 */
import sharp from "sharp";

const SIZE = 512;
/** Corner radius as a fraction of the icon, matching the design's
 * rounded frame (60.68 of 512). */
const RADIUS_RATIO = 60.68 / 512;

const master = Buffer.from(
  await Bun.file("./public/brand/icon-square.png").arrayBuffer(),
);

/** Square, straight from the master. */
const square = (size: number) =>
  sharp(master).resize(size, size).png().toBuffer();

/** Rounded: the master masked by a rounded-rect of matching radius. */
async function rounded(size: number) {
  const r = Math.round(size * RADIUS_RATIO);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/>` +
      `</svg>`,
  );
  const flat = await sharp(master).resize(size, size).png().toBuffer();
  return sharp(flat)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

await Bun.write("./app/icon.png", await rounded(SIZE));
await Bun.write("./public/favicon-32.png", await rounded(32));
await Bun.write("./app/apple-icon.png", await square(180));
await Bun.write("./public/brand/icon-40.png", await rounded(40));

console.log(
  "icons written: app/icon.png + public/favicon-32.png + public/brand/icon-40.png (rounded), app/apple-icon.png (square)",
);
