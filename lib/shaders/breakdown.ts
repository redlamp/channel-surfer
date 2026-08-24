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

/* Tile 0 — source, untouched. */
vec3 imageSource(vec3 color) {
  return color;
}

/* Tile 1 — "Hue Mid": any saturation snaps to full. */
vec3 imageMaxSat(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  hsv.y = hsv.y > 0.0 ? 1.0 : 0.0;
  return hsv2rgb(hsv);
}

/* Tile 2 — "Hue Max": full sat + full value; greys posterize to 3 stops. */
vec3 imageMaxSatMaxVal(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  if (hsv.y > 0.0) {
    hsv.y = 1.0;
    hsv.z = 1.0;
  } else {
    hsv.y = 0.0;
    if (hsv.z < 0.2)      hsv.z = 0.0;
    else if (hsv.z < 0.8) hsv.z = 0.5;
    else                  hsv.z = 1.0;
  }
  return hsv2rgb(hsv);
}

/* Tile 3 — hue distance from a target hue. Three styles (uHueMapStyle):
   0 warm/cool directional accents, 1 proximity glow (pixel keeps its own
   hue, brightness = closeness), 2 posterized distance bands. Near-greys
   are suppressed to black in all styles. */
vec3 imageHue(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  float hue = hsv.x;
  float sat = hsv.y;
  float satThresh = 0.01;
  float mask = step(satThresh, sat);

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
  bool tintTile = !peek && tileIndex >= 6;
  vec3 tint = vec3(0.0);
  if      (peek)           color = imageSource(color);
  else if (tileIndex == 0) color = imageSource(color);
  else if (tileIndex == 1) color = imageMaxSat(color);
  else if (tileIndex == 2) color = imageMaxSatMaxVal(color);
  else if (tileIndex == 3) color = imageHue(color);
  else if (tileIndex == 4) color = imageSat(color);
  else if (tileIndex == 5) color = imageVal(color);
  else if (tileIndex == 6) { tint = vec3(color.r, 0.0, 0.0); color = vec3(color.r); }
  else if (tileIndex == 7) { tint = vec3(0.0, color.g, 0.0); color = vec3(color.g); }
  else                     { tint = vec3(0.0, 0.0, color.b); color = vec3(color.b); }

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
