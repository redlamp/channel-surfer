/**
 * The channel-breakdown shader pair, ported from the Gigi prototype's
 * MakeTiles.hlsl + SRGB.hlsli. One fullscreen quad; the fragment shader
 * derives a 3x3 tile grid from the UV, samples the source once per pixel,
 * and applies a per-tile transform.
 *
 * Color discipline (matches the HLSL): the source texture is tagged sRGB so
 * samples arrive linear, every transform runs in linear, and the final color
 * is converted linear -> sRGB explicitly here. No three.js color-space
 * chunks are involved.
 */

export const breakdownVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  // World-space plane under an orthographic camera, so MapControls
  // pan/zoom applies (and future displacement work gets a real camera).
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const breakdownFragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D uSource;
// Hue-map focal hue in [0,1]. 0.5 (180 deg) at rest; while the cursor is
// over the hue-map tile it tracks the hovered pixel's hue (tweened on CPU).
uniform float uTargetHue;
// 0 = RGB channel tiles render black-to-white; 1 = black-to-channel-color.
// Tweened on CPU so the click toggle cross-fades.
uniform float uRgbColorize;
// Hovered tile index, or -1 for none. The hover outline is drawn here in
// the fragment shader (an overlay line object flashed on remount).
uniform float uHoverTile;
// 0 = HSB (saturation/brightness tiles), 1 = HSL (saturation/lightness).
uniform float uColorModel;
// Hue-map rendering: 0 warm/cool accents, 1 proximity glow (with quarter-
// turn landmark rings), 2 twilight-style cyclic ramp, 3 four-landmark
// diamond, 4 crawling distance bands (direction = crawl sign).
// Styles 2-4 come from wiki/research/hue-direction-encoding.md.
uniform float uHueMapStyle;
// Transform id per grid position, reading order. Ids come from
// TILE_TRANSFORMS in lib/tile-transforms.ts; applyTransform() below
// switches on them, so any transform can sit on any tile.
uniform float uTileTransform[9];
// Brightness level the "mid" effect pins every pixel to, 0-1.
uniform float uMidLevel;
// Chroma below which a pixel counts as neutral, shared by every effect in
// the hue family so they all draw the line in the same place.
uniform float uNeutralTol;
// Seconds, monotonically increasing; only the crawl style consumes it.
uniform float uTime;
// 0 = transforms run in linear light (the Gigi original); 1 = transforms
// run on sRGB values, matching how the readouts and most tools compute.
uniform float uSrgbMath;
// Intra-tile UV units per screen pixel, per axis — computed on CPU from
// camera zoom so outlines and rings keep constant screen size.
uniform vec2 uUvPerPx;
// Pinned sample position in intra-tile UV (v up); x < 0 = no pin. A ring
// is drawn at this spot on every tile.
uniform vec2 uPinUv;
// Cursor position in intra-tile UV; a small echo ring marks the matching
// spot on every tile EXCEPT the hovered one. x < 0 = none.
uniform vec2 uHoverUv;
// Focus-mode isolation: when >= 0, only this tile renders (others discard).
uniform float uIsolateTile;
// Source peek (hold space while framed): this tile renders the untouched
// source instead of its transform. -1 = off.
uniform float uPeekTile;

/* RGB in [0,1] -> HSV (h, s, v each in [0,1]) */
vec3 rgb2hsv(vec3 c) {
  float cmax = max(c.r, max(c.g, c.b));
  float cmin = min(c.r, min(c.g, c.b));
  float diff = cmax - cmin;

  float h = 0.0;
  if (cmax != cmin) {
    if (cmax == c.r)      h = (c.g - c.b) / diff;
    else if (cmax == c.g) h = 2.0 + (c.b - c.r) / diff;
    else                  h = 4.0 + (c.r - c.g) / diff;
    h /= 6.0;
    if (h < 0.0) h += 1.0;
  }

  float s = (cmax == 0.0) ? 0.0 : (diff / cmax);
  return vec3(h, s, cmax);
}

/* HSV (each in [0,1]) -> RGB in [0,1] */
vec3 hsv2rgb(vec3 c) {
  float h = c.x;
  float s = c.y;
  float v = c.z;

  if (s == 0.0) return vec3(v);

  h = fract(h) * 6.0;
  int sector = int(h);
  float f = h - float(sector);

  float p = v * (1.0 - s);
  float q = v * (1.0 - s * f);
  float t = v * (1.0 - s * (1.0 - f));

  if (sector == 0) return vec3(v, t, p);
  if (sector == 1) return vec3(q, v, p);
  if (sector == 2) return vec3(p, v, t);
  if (sector == 3) return vec3(p, q, v);
  if (sector == 4) return vec3(t, p, v);
  return vec3(v, p, q);
}

/* RGB in [0,1] -> HSL (h, s, l each in [0,1]) */
vec3 rgb2hsl(vec3 c) {
  float cmax = max(c.r, max(c.g, c.b));
  float cmin = min(c.r, min(c.g, c.b));
  float delta = cmax - cmin;
  float l = (cmax + cmin) * 0.5;
  float s = (delta == 0.0) ? 0.0 : delta / (1.0 - abs(2.0 * l - 1.0));
  return vec3(rgb2hsv(c).x, s, l);
}

vec3 linearToSRGB(vec3 lin) {
  vec3 lo = lin * 12.92;
  vec3 hi = pow(abs(lin), vec3(1.0 / 2.4)) * 1.055 - 0.055;
  return vec3(
    lin.r <= 0.0031308 ? lo.r : hi.r,
    lin.g <= 0.0031308 ? lo.g : hi.g,
    lin.b <= 0.0031308 ? lo.b : hi.b
  );
}

/* How much real colour a pixel carries: 0 = neutral, 1 = definitely
   coloured. Measured as CHROMA (max - min), not saturation.

   Saturation divides chroma by max, and that division amplifies noise in
   the shadows: rgb(2,2,3) is one 255th off neutral yet reports saturation
   0.33, while genuine pale skin reports only 0.21. No saturation
   threshold can separate them — the orderings overlap. Chroma has no such
   division, so codec noise lands around 0.004-0.012 and real colour
   around 0.2, leaving a wide empty gap to cut in.

   Feathered narrowly around the tolerance so the cut-off reads as hard
   posterization without aliasing into a crawling edge on gradients. */
float colorfulness(vec3 c) {
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float tol = max(uNeutralTol, 1e-5);
  return smoothstep(tol * 0.75, tol * 1.5, chroma);
}

/* Tile 0 — source, untouched. */
vec3 imageSource(vec3 color) {
  return color;
}

/* Tile 1 — "Hue · shaded": saturation snaps to full, brightness is kept,
   so the hue still carries the image's shading. */
vec3 imageMaxSat(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  return hsv2rgb(vec3(hsv.x, colorfulness(color), hsv.z));
}

/* "Flat": full saturation AND full value, so shading is discarded and only
   pure hue remains. True neutrals have no hue to show, so they threshold
   at 50% brightness to pure black or pure white — a hard two-way split
   rather than the three grey stops the Gigi original posterized to. */
vec3 imageFlat(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  vec3 neutral = vec3(step(0.5, hsv.z));
  return mix(neutral, hsv2rgb(vec3(hsv.x, 1.0, 1.0)), colorfulness(color));
}

/* "Flat, 3-step": the Gigi original's neutral handling — same maxed hue,
   but true neutrals posterize to black / mid grey / white at 0.2 and 0.8
   rather than splitting two ways at 0.5. Kept beside "flat" so the two
   neutral treatments can be compared on the same image. */
vec3 imageFlatSteps(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  float g = hsv.z < 0.2 ? 0.0 : (hsv.z < 0.8 ? 0.5 : 1.0);
  return mix(vec3(g), hsv2rgb(vec3(hsv.x, 1.0, 1.0)), colorfulness(color));
}

/* "Lit": saturation survives, brightness is pushed to full — the fourth
   cell of the factorial that source/shaded/flat already form. Hue and
   saturation with the shading stripped out; neutrals go white, since a
   grey at full value is white. */
vec3 imageLit(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  return hsv2rgb(vec3(hsv.x, hsv.y * colorfulness(color), 1.0));
}

/* "Mid": hue and saturation both survive, brightness is pinned to one
   level for every pixel (uMidLevel). Shading disappears the way it does
   under "lit", but the level is adjustable, so it stops short of the
   blow-out that maxing brightness causes. */
vec3 imageMid(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  return hsv2rgb(vec3(hsv.x, hsv.y * colorfulness(color), uMidLevel));
}

/* "Chroma": hue at full saturation, brightness = HSB chroma (sat * val),
   which is how much colour is actually present. Neutrals fall to black
   instead of shouting a hue no one can see, so shadow chroma noise stops
   reading as confetti. */
vec3 imageChroma(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  return hsv2rgb(vec3(hsv.x, 1.0, hsv.y * hsv.z));
}

/* "Families": hue snapped to the six primaries and secondaries,
   collapsing the image into the palette it is built from. */
vec3 imageFamilies(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  float binned = (floor(hsv.x * 6.0) + 0.5) / 6.0;
  return hsv2rgb(vec3(binned, 1.0, colorfulness(color)));
}

/* "Warm / cool": the painter's single axis, centred on 45 deg (orange)
   against 225 deg (azure). Neutrals sink to near-black and weak colour
   fades toward it, so the split stays honest. */
vec3 imageWarmCool(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  float d = abs(fract(hsv.x - 45.0 / 360.0 + 0.5) - 0.5) * 2.0;
  float w = 1.0 - smoothstep(0.35, 0.65, d);
  vec3 warm = vec3(0.98, 0.62, 0.25);
  vec3 cool = vec3(0.30, 0.55, 0.88);
  return mix(vec3(0.09), mix(cool, warm, w), colorfulness(color));
}

/* "Contours": bright lines wherever hue crosses a 30 deg boundary,
   tinted with the local hue. Shows where hue *changes* rather than what
   it is — a topographic map of the hue channel. */
vec3 imageContours(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  float f = fract(hsv.x * 12.0);
  float d = min(f, 1.0 - f);
  float line = 1.0 - smoothstep(0.012, 0.04, d);
  vec3 ink = hsv2rgb(vec3(hsv.x, 1.0, 1.0));
  return mix(vec3(0.05), ink, line * colorfulness(color));
}

/* Tile 3 — hue distance from a target hue. Three styles (uHueMapStyle):
   0 warm/cool directional accents, 1 proximity glow (pixel keeps its own
   hue, brightness = closeness), 2 posterized distance bands. Near-greys
   are suppressed to black in all styles. */
vec3 imageHue(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  float hue = hsv.x;
  float sat = hsv.y;
  float mask = colorfulness(color);

  // Signed shortest hue difference in [-0.5, 0.5], and its magnitude
  // mapped to 0..1 (0 at target, 1 at the opposite hue).
  float signedDelta = fract(hue - uTargetHue + 0.5) - 0.5;
  float u = clamp(abs(signedDelta) * 2.0, 0.0, 1.0);

  vec3 outCol;
  if (uHueMapStyle < 0.5) {
    vec3 coolAccent  = hsv2rgb(vec3(200.0 / 360.0, 0.66, 0.5));
    vec3 warmAccent  = hsv2rgb(vec3( 40.0 / 360.0, 0.66, 0.5));
    float accentPeak = 0.5;
    float accentSoft = 0.5;
    vec3 accent = (signedDelta < 0.0) ? warmAccent : coolAccent;
    float t1 = smoothstep(0.0, accentPeak, u);
    float t2 = smoothstep(accentPeak, min(1.0, accentPeak + accentSoft), u);
    vec3 mid = mix(vec3(1.0), accent, t1);
    outCol = mix(mid, vec3(0.0), t2);
  } else if (uHueMapStyle < 1.5) {
    // Proximity glow: pixel keeps its own hue, brightness = closeness,
    // with faint landmark rings at the quarter turns (|delta| = 90 deg).
    float closeness = 1.0 - u;
    outCol = hsv2rgb(vec3(hue, 1.0, closeness * closeness));
    float lm = 1.0 - smoothstep(0.0, 0.02, abs(u - 0.5));
    outCol = mix(outCol, vec3(1.0), lm * 0.35);
  } else if (uHueMapStyle < 2.5) {
    // Twilight-class cyclic ramp: white at target, lightness-matched
    // blue (CW) vs red (CCW) arms converging on one dark at the antipode.
    vec3 whiteC = vec3(0.92);
    vec3 blueC  = vec3(0.32, 0.44, 0.76);
    vec3 redC   = vec3(0.76, 0.36, 0.31);
    vec3 darkC  = vec3(0.11, 0.07, 0.15);
    vec3 arm = (signedDelta < 0.0) ? redC : blueC;
    float t1 = smoothstep(0.0, 0.5, u);
    float t2 = smoothstep(0.5, 1.0, u);
    outCol = mix(mix(whiteC, arm, t1), darkC, t2);
  } else if (uHueMapStyle < 3.5) {
    // Four-landmark diamond: white -> teal (+1/4 turn) -> black (opposite)
    // <- magenta (-1/4 turn) <- white; equal-lightness accents.
    vec3 tealC = vec3(0.0, 0.55, 0.52);
    vec3 magC  = vec3(0.72, 0.15, 0.62);
    vec3 arm = (signedDelta < 0.0) ? magC : tealC;
    float t1 = smoothstep(0.0, 0.5, u);
    float t2 = smoothstep(0.5, 1.0, u);
    outCol = mix(mix(vec3(1.0), arm, t1), vec3(0.0), t2);
  } else {
    // Crawling bands: grayscale distance, stripes crawl; the two rotation
    // directions crawl opposite ways, so sign reads even at the antipode.
    float base = 1.0 - u;
    float stripe = 0.5 + 0.5 *
      cos(6.2831853 * (abs(signedDelta) * 6.0 - uTime * 0.6 * sign(signedDelta)));
    outCol = vec3(base * (0.65 + 0.35 * stripe));
  }

  return mix(vec3(0.0), outCol, mask);
}

/* The two models' channels, pinned rather than following the Model
   toggle, so an HSL pair can sit on the grid beside an HSB pair and the
   difference between the definitions is visible at once instead of one
   toggle-flip apart. */
vec3 imageSatHsb(vec3 color) { return vec3(rgb2hsv(color).y); }
vec3 imageSatHsl(vec3 color) { return vec3(rgb2hsl(color).y); }
vec3 imageValueHsb(vec3 color) { return vec3(rgb2hsv(color).z); }
vec3 imageLightHsl(vec3 color) { return vec3(rgb2hsl(color).z); }

/* Tile 4 — saturation as grayscale. uColorModel is eased on CPU, so the
   tile cross-fades between the HSB and HSL definitions. */
vec3 imageSat(vec3 color) {
  float s = mix(rgb2hsv(color).y, rgb2hsl(color).y, uColorModel);
  return vec3(s);
}

/* Tile 5 — brightness (HSB) to lightness (HSL), same cross-fade. */
vec3 imageVal(vec3 color) {
  float v = mix(rgb2hsv(color).z, rgb2hsl(color).z, uColorModel);
  return vec3(v);
}

/* The effect library's dispatcher. tid is the transform id from
   TILE_TRANSFORMS (lib/tile-transforms.ts) assigned to this tile, so the
   grid position no longer decides what runs here. The tint out-param is
   the channel ink for the R/G/B effects and stays black for everything
   else, which keeps the black-to-color cross-fade travelling with the
   effect rather than with the bottom row. */
vec3 applyTransform(float tid, vec3 color, out vec3 tint, out float isChannel) {
  tint = vec3(0.0);
  isChannel = 0.0;
  int id = int(tid + 0.5);
  if (id == 0)  return imageSource(color);
  if (id == 1)  return imageMaxSat(color);
  if (id == 2)  return imageFlat(color);
  if (id == 3)  return imageLit(color);
  if (id == 4)  return imageHue(color);
  if (id == 5)  return imageSat(color);
  if (id == 6)  return imageVal(color);
  if (id == 7)  { isChannel = 1.0; tint = vec3(color.r, 0.0, 0.0); return vec3(color.r); }
  if (id == 8)  { isChannel = 1.0; tint = vec3(0.0, color.g, 0.0); return vec3(color.g); }
  if (id == 9)  { isChannel = 1.0; tint = vec3(0.0, 0.0, color.b); return vec3(color.b); }
  if (id == 10) return imageChroma(color);
  if (id == 11) return imageFamilies(color);
  if (id == 12) return imageWarmCool(color);
  if (id == 13) return imageContours(color);
  if (id == 14) return imageMid(color);
  if (id == 15) return imageSatHsb(color);
  if (id == 16) return imageSatHsl(color);
  if (id == 17) return imageValueHsb(color);
  if (id == 18) return imageLightHsl(color);
  if (id == 19) return imageFlatSteps(color);
  return imageSource(color);
}

void main() {
  vec2 grid = vUv * 3.0;
  vec2 tileUv = fract(grid);

  int col = int(min(floor(grid.x), 2.0));
  // vUv.y = 1 is the top of the quad; row 0 is the top row, as in the HLSL.
  int row = 2 - int(min(floor(grid.y), 2.0));
  int tileIndex = row * 3 + col;

  // Focus-mode isolation: everything but the focused tile disappears.
  if (uIsolateTile > -0.5 && tileIndex != int(uIsolateTile + 0.5)) discard;

  // uSrgbMath is eased on CPU, so the two math modes cross-fade rather
  // than snap. Blending the input encoding and the output conversion is
  // exact at both ends (0 = transforms in linear light with an sRGB
  // output convert, 1 = transforms on sRGB values, no output convert)
  // and reads as a smooth gamma morph in between.
  vec3 srcLinear = texture2D(uSource, tileUv).rgb;
  vec3 color = mix(srcLinear, linearToSRGB(srcLinear), uSrgbMath);

  bool peek = uPeekTile > -0.5 && tileIndex == int(uPeekTile + 0.5);

  // Which effect this tile is carrying. A loop over a constant range is
  // how ESSL 1.00 permits indexing a uniform array by a computed value.
  float tid = 0.0;
  for (int i = 0; i < 9; i++) {
    if (i == tileIndex) tid = uTileTransform[i];
  }

  vec3 tint = vec3(0.0);
  float isChannel = 0.0;
  color = peek
    ? imageSource(color)
    : applyTransform(tid, color, tint, isChannel);
  bool tintTile = !peek && isChannel > 0.5;

  color = mix(linearToSRGB(color), color, uSrgbMath);

  // Tint cross-fades in sRGB space. A linear-light mix front-loads the
  // perceptible change when fading back to white, which read as a snap.
  if (tintTile) {
    vec3 tintSrgb = mix(linearToSRGB(tint), tint, uSrgbMath);
    color = mix(color, tintSrgb, uRgbColorize);
  }

  // Hover outline: constant 2px edge on the hovered tile.
  if (uHoverTile > -0.5 && tileIndex == int(uHoverTile + 0.5)) {
    vec2 w = uUvPerPx * 2.0;
    bool onEdge =
      tileUv.x < w.x || tileUv.x > 1.0 - w.x ||
      tileUv.y < w.y || tileUv.y > 1.0 - w.y;
    if (onEdge) color = vec3(1.0);
  }

  // Cursor echo: small ring at the matching spot on the OTHER tiles.
  // Rings are drawn with smoothstep feathering (~1px) so they stay clean
  // on the antialias:false canvas.
  if (uHoverUv.x > -0.5 &&
      (uHoverTile < -0.5 || tileIndex != int(uHoverTile + 0.5))) {
    // Echo rings sit at 50% alpha so they annotate without covering.
    float d = abs(length((tileUv - uHoverUv) / uUvPerPx) - 5.0);
    float halo = 1.0 - smoothstep(1.1, 2.2, d);
    color = mix(color, vec3(0.0), halo * 0.5);
    float ring = 1.0 - smoothstep(0.6, 1.5, d);
    color = mix(color, vec3(1.0), ring * 0.5);
  }

  // Pinned sample: larger ring at the pinned spot on every tile.
  if (uPinUv.x > -0.5) {
    float d = abs(length((tileUv - uPinUv) / uUvPerPx) - 9.0);
    float halo = 1.0 - smoothstep(1.6, 3.0, d);
    color = mix(color, vec3(0.0), halo * 0.85);
    float ring = 1.0 - smoothstep(1.0, 2.0, d);
    color = mix(color, vec3(1.0), ring);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
