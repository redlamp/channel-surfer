---
tags: [domain/color, status/draft]
---

# Wide Gamut: Where Channel Surfer Stands

**Date:** 2026-09-01 · **Question:** most phones and many monitors (Taylor's
Samsung Odyssey included) are Display P3 or wider. What does the app do
with that today, and what would it take to do better?

## What happens today (verified in code)

Every stage is sRGB, and the browser enforces most of it:

1. **Decode.** `createImageBitmap(blob)` with default options applies the
   file's ICC profile and converts to sRGB. A P3-tagged JPEG's colours
   outside sRGB are clipped here, before the app sees a pixel. An
   *untagged* file is assumed sRGB and passed through unchanged, which is
   also what the library panel's `Untagged (sRGB assumed)` row means.
2. **Readouts.** The 2D canvas the readouts sample from is created with
   the default `colorSpace: "srgb"`.
3. **Texture and shader.** Three tags the texture `SRGBColorSpace`; the
   shader's linear↔sRGB conversions are the sRGB transfer function with
   sRGB primaries implied.
4. **Output.** The WebGL drawing buffer is sRGB
   (`drawingBufferColorSpace` default). On a P3 display the OS maps the
   sRGB buffer into the wider gamut, so the tiles look *correct*, just
   never more saturated than sRGB allows.

Net: the app is honest and consistent, and the Inspect tab now says
`Display · Display P3 · tiles sRGB` on a wide-gamut screen so the ceiling
is visible rather than silent. The library panel also names a JPEG's
embedded profile (`ICC: Display P3`) instead of just flagging that one
exists.

## The hooks that would open it up

Chrome (and Safari for most of these) expose a P3 path end to end:

| Stage | sRGB today | P3 hook |
|---|---|---|
| Decode | `createImageBitmap(blob)` | `createImageBitmap(blob, { colorSpaceConversion: "none" })` keeps the file's raw values, but then the app must interpret them itself (needs the profile parsed, or an assumption) |
| Readout canvas | `getContext("2d")` | `getContext("2d", { colorSpace: "display-p3" })` — `getImageData` returns P3 values |
| WebGL | default | `gl.drawingBufferColorSpace = "display-p3"` and `gl.unpackColorSpace = "display-p3"` (Chrome 104+) |
| three.js | `SRGBColorSpace` | three has `DisplayP3ColorSpace` / `LinearDisplayP3ColorSpace` and a `ColorManagement.workingColorSpace`; the custom shader would need its own matrices since it bypasses three's chunks by design |
| Readout maths | sRGB HSB | HSB/HSL are model-agnostic, but the hex and 0-255 values would have to say which space they are in |

## Why not yet

- **Two truths.** The readouts and the tiles share one decode today, which
  is what keeps the eyedropper honest. A P3 pipeline needs every readout
  labelled with its space, and a way to show both (sRGB clip vs P3).
- **Source honesty.** Most images people will drop are untagged JPEGs;
  treating them as P3 would over-saturate them. Only tagged sources
  benefit, and the header parser already tells us which those are.
- **Testing.** The e2e suite reads pixels back and compares them with CPU
  maths in sRGB. A P3 path needs the same in P3, and headless Chromium
  reports `color-gamut: srgb`.

## If it is built

1. Detect a tagged wide-gamut source (the `ICC:` row already does).
2. Decode with `colorSpaceConversion: "none"` into a `display-p3` 2D
   canvas, upload with `unpackColorSpace = "display-p3"`, render into a
   `display-p3` drawing buffer. Keep the shader maths as is: P3 is also a
   gamma-encoded RGB space with the sRGB transfer curve, so the linear↔
   encoded steps are unchanged; only the primaries differ, and the tiles
   never mix spaces.
3. A **Gamut** setting (sRGB / Display P3 when available) beside Gamma,
   defaulting to sRGB, and a `P3` badge on readouts while it is on.
4. Extend `tests/e2e/shader.e2e.ts` with a P3 run guarded on
   `matchMedia("(color-gamut: p3)")`.

Filed on [[backlog]].
