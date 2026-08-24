/**
 * Generates the favicon set from the same ingredients as the social
 * card: the linear rainbow as the backdrop, the surfer composited on
 * top. Small sizes crop the rainbow's middle band (the widest hue
 * sweep) and scale the surfer to nearly fill the tile, so the mark
 * still reads at 16px.
 *
 * Run: bun scripts/generate-favicon.ts
 */
import sharp from "sharp";

const rainbow = Buffer.from(
  await Bun.file("./public/demo/linear-rainbow.webp").arrayBuffer(),
);
const surferSrc = Buffer.from(
  await Bun.file("./public/brand/surfer.png").arrayBuffer(),
);

/**
 * One square icon: rainbow tile + surfer at `fill` of the tile.
 *
 * The backdrop is darkened and desaturated slightly so the surfer (warm
 * orange on a light-cyan wave) keeps contrast against every hue it sits
 * over — at 16px the two otherwise merge into confetti. The surfer also
 * carries a soft dark halo, built by blurring its own alpha.
 */
async function icon(size: number, fill = 0.86) {
  const bg = await sharp(rainbow)
    .resize(size, size, { fit: "cover", position: "center" })
    .modulate({ brightness: 0.72, saturation: 0.92 })
    .toBuffer();

  const s = Math.round(size * fill);
  const surfer = await sharp(surferSrc)
    .resize(s, s, { fit: "inside" })
    .toBuffer();
  const meta = await sharp(surfer).metadata();
  const w = meta.width ?? s;
  const h = meta.height ?? s;
  const left = Math.round((size - w) / 2);
  const top = Math.round((size - h) / 2);

  // Halo: a black plate wearing the surfer's own alpha, blurred. Built
  // by joining the extracted alpha onto a black RGB canvas — compositing
  // a raw alpha buffer instead silently yields a solid square.
  const alphaPng = await sharp(surfer)
    .extractChannel("alpha")
    .toColourspace("b-w")
    .png()
    .toBuffer();
  const halo = await sharp({
    create: { width: w, height: h, channels: 3, background: "#000000" },
  })
    .joinChannel(alphaPng)
    .blur(Math.max(0.6, size * 0.012))
    .png()
    .toBuffer();

  return sharp(bg)
    .composite([
      { input: halo, left, top },
      { input: surfer, left, top },
    ])
    .png()
    .toBuffer();
}

// Rounded-square mask for the Apple touch icon's larger canvas.
await Bun.write("./app/icon.png", await icon(512));
await Bun.write("./app/apple-icon.png", await icon(180));
await Bun.write("./public/favicon-32.png", await icon(32, 0.92));

console.log(
  "icons written:",
  ["app/icon.png", "app/apple-icon.png", "public/favicon-32.png"].join(", "),
);
