/**
 * Generates public/og.png — the social preview card: the SMPTE demo
 * broken into the labeled 3x3 channel grid (an homage to the 2020 tweet
 * mock that started the project), using the same math as the shader
 * with today's defaults (twilight hue map, colorized RGB tiles).
 *
 * Run: bun scripts/generate-og.ts
 */
import sharp from "sharp";

const W = 1200;
const H = 630;
const TILE_W = W / 3;
const TILE_H = H / 3;

const srgbToLin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const linToSrgb = (v: number) =>
  Math.round(
    Math.min(
      1,
      Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055),
    ) * 255,
  );

function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  if (s === 0) return [v, v, v];
  const i = Math.floor(((h % 1) + 1) % 1 * 6);
  const f = ((h % 1) + 1) % 1 * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  return (
    [
      [v, t, p],
      [q, v, p],
      [p, v, t],
      [p, q, v],
      [t, p, v],
      [v, p, q],
    ][i % 6] as [number, number, number]
  );
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The twilight hue map, target 180deg (the shipping default). */
function twilight(h: number, s: number): [number, number, number] {
  if (s < 0.01) return [0, 0, 0];
  let sd = (h - 0.5 + 0.5) % 1;
  if (sd < 0) sd += 1;
  sd -= 0.5;
  const u = Math.min(Math.abs(sd) * 2, 1);
  const arm: [number, number, number] =
    sd < 0 ? [0.76, 0.36, 0.31] : [0.32, 0.44, 0.76];
  const t1 = smooth(0, 0.5, u);
  const t2 = smooth(0.5, 1, u);
  const white = 0.92;
  const dark = [0.11, 0.07, 0.15];
  return [0, 1, 2].map((i) =>
    mix(mix(white, arm[i], t1), dark[i], t2),
  ) as [number, number, number];
}

type Fn = (r: number, g: number, b: number) => [number, number, number];
const TRANSFORMS: { label: string; fn: Fn }[] = [
  { label: "SOURCE", fn: (r, g, b) => [r, g, b] },
  {
    label: "HUE · MID",
    fn: (r, g, b) => {
      const [h, s, v] = rgb2hsv(r, g, b);
      return hsv2rgb(h, s > 0 ? 1 : 0, v);
    },
  },
  {
    label: "HUE · MAX",
    fn: (r, g, b) => {
      const [h, s, v] = rgb2hsv(r, g, b);
      if (s > 0) return hsv2rgb(h, 1, 1);
      const vv = v < 0.2 ? 0 : v < 0.8 ? 0.5 : 1;
      return [vv, vv, vv];
    },
  },
  {
    label: "HUE MAP",
    fn: (r, g, b) => {
      const [h, s] = rgb2hsv(r, g, b);
      return twilight(h, s);
    },
  },
  {
    label: "SATURATION",
    fn: (r, g, b) => {
      const s = rgb2hsv(r, g, b)[1];
      return [s, s, s];
    },
  },
  {
    label: "BRIGHTNESS",
    fn: (r, g, b) => {
      const v = rgb2hsv(r, g, b)[2];
      return [v, v, v];
    },
  },
  { label: "RED", fn: (r) => [r, 0, 0] },
  { label: "GREEN", fn: (_r, g) => [0, g, 0] },
  { label: "BLUE", fn: (_r, _g, b) => [0, 0, b] },
];

const src = await Bun.file("./public/demo/smpte-bars.webp").arrayBuffer();
const tile = await sharp(Buffer.from(src))
  .resize(TILE_W, TILE_H, { fit: "cover" })
  .ensureAlpha()
  .raw()
  .toBuffer();

const tiles: Buffer[] = TRANSFORMS.map(({ fn }) => {
  const out = Buffer.alloc(TILE_W * TILE_H * 3);
  for (let p = 0, q = 0; p < tile.length; p += 4, q += 3) {
    const [r, g, b] = fn(
      srgbToLin(tile[p]),
      srgbToLin(tile[p + 1]),
      srgbToLin(tile[p + 2]),
    );
    out[q] = linToSrgb(r);
    out[q + 1] = linToSrgb(g);
    out[q + 2] = linToSrgb(b);
  }
  return out;
});

const labels = TRANSFORMS.map(({ label }, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const cx = col * TILE_W + TILE_W / 2;
  const y = row * TILE_H + TILE_H - 16;
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Consolas, 'Courier New', monospace" font-size="24" font-weight="bold" fill="#ffffff" stroke="#000000" stroke-width="5" paint-order="stroke" letter-spacing="2">${label}</text>`;
}).join("");

const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${labels}
  <g>
    <rect x="${W / 2 - 260}" y="${H / 2 - 44}" width="520" height="88" rx="14" fill="#181818" fill-opacity="0.92" stroke="#ffffff" stroke-opacity="0.25"/>
    <text x="${W / 2}" y="${H / 2 - 4}" text-anchor="middle" font-family="Consolas, 'Courier New', monospace" font-size="40" font-weight="bold" fill="#ffffff" letter-spacing="3">CHANNEL SURFER</text>
    <text x="${W / 2}" y="${H / 2 + 30}" text-anchor="middle" font-family="Consolas, 'Courier New', monospace" font-size="19" fill="#b8b8b8" letter-spacing="1">how RGB &amp; HSB channels build an image</text>
  </g>
</svg>`;

await sharp({
  create: { width: W, height: H, channels: 3, background: "#181818" },
})
  .composite([
    ...tiles.map((data, i) => ({
      input: data,
      raw: { width: TILE_W, height: TILE_H, channels: 3 as const },
      left: (i % 3) * TILE_W,
      top: Math.floor(i / 3) * TILE_H,
    })),
    { input: Buffer.from(overlay), left: 0, top: 0 },
  ])
  .png()
  .toFile("./public/og.png");

console.log("wrote public/og.png", (Bun.file("./public/og.png").size / 1024).toFixed(0) + "KB");
