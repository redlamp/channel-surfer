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
// Outline half-width in intra-tile UV units per axis, precomputed on CPU
// from camera zoom so the line stays a constant screen width.
uniform vec2 uOutlineUv;

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

/* Tile 3 — hue distance from a target hue, white -> warm/cool accent ->
   black, with near-greys suppressed. */
vec3 imageHue(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  float hue = hsv.x;
  float sat = hsv.y;

  // Tunables (future settings-panel candidates).
  float targetHue  = uTargetHue;
  vec3 coolAccent  = hsv2rgb(vec3(200.0 / 360.0, 0.66, 0.5));
  vec3 warmAccent  = hsv2rgb(vec3( 40.0 / 360.0, 0.66, 0.5));
  float satThresh  = 0.01;
  float accentPeak = 0.5;
  float accentSoft = 0.5;

  // Signed shortest hue difference in [-0.5, 0.5].
  float signedDelta = fract(hue - targetHue + 0.5) - 0.5;

  // Distance from target mapped to 0..1 (0 at target, 1 at opposite).
  float u = clamp(abs(signedDelta) * 2.0, 0.0, 1.0);

  vec3 accent = (signedDelta < 0.0) ? warmAccent : coolAccent;

  float t1 = smoothstep(0.0, accentPeak, u);
  float t2 = smoothstep(accentPeak, min(1.0, accentPeak + accentSoft), u);

  vec3 mid    = mix(vec3(1.0), accent, t1);
  vec3 outCol = mix(mid, vec3(0.0), t2);

  float mask = step(satThresh, sat);
  return mix(vec3(0.0), outCol, mask);
}

/* Tile 4 — saturation as grayscale. */
vec3 imageSat(vec3 color) {
  return vec3(rgb2hsv(color).y);
}

/* Tile 5 — value/brightness as grayscale. */
vec3 imageVal(vec3 color) {
  return vec3(rgb2hsv(color).z);
}

void main() {
  vec2 grid = vUv * 3.0;
  vec2 tileUv = fract(grid);

  int col = int(min(floor(grid.x), 2.0));
  // vUv.y = 1 is the top of the quad; row 0 is the top row, as in the HLSL.
  int row = 2 - int(min(floor(grid.y), 2.0));
  int tileIndex = row * 3 + col;

  vec3 color = texture2D(uSource, tileUv).rgb;

  if      (tileIndex == 0) color = imageSource(color);
  else if (tileIndex == 1) color = imageMaxSat(color);
  else if (tileIndex == 2) color = imageMaxSatMaxVal(color);
  else if (tileIndex == 3) color = imageHue(color);
  else if (tileIndex == 4) color = imageSat(color);
  else if (tileIndex == 5) color = imageVal(color);
  else if (tileIndex == 6) color = mix(vec3(color.r), vec3(color.r, 0.0, 0.0), uRgbColorize);
  else if (tileIndex == 7) color = mix(vec3(color.g), vec3(0.0, color.g, 0.0), uRgbColorize);
  else                     color = mix(vec3(color.b), vec3(0.0, 0.0, color.b), uRgbColorize);

  color = linearToSRGB(color);

  if (uHoverTile > -0.5 && tileIndex == int(uHoverTile + 0.5)) {
    bool onEdge =
      tileUv.x < uOutlineUv.x || tileUv.x > 1.0 - uOutlineUv.x ||
      tileUv.y < uOutlineUv.y || tileUv.y > 1.0 - uOutlineUv.y;
    if (onEdge) color = vec3(1.0);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
