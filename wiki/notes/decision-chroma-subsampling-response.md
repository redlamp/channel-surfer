---
tags: [domain/color, status/adopted]
---

# Decision: Detect Chroma Subsampling and Smooth It, Never Reconstruct

**Date:** 2026-08-27 · **Status:** adopted (shipped in v0.3, 2026-08-27)

## Context

Taylor: *"the quality of some of the tiles looks much lower resolution
than the source mode."* Investigation concluded: **the shader runs at
full source resolution; the source files carry colour at half
resolution.** JPEG 4:2:0 chroma subsampling stores full-res luma over one
Cb/Cr sample per 2×2 block (post-quantization, effects extend to 16×16
DCT blocks).

The tell that made it conclusive: Taylor's own tile-by-tile report split
exactly along the luma-cancellation line. Sharp tiles keep luma in their
output (Source, R/G/B channels, Brightness — `R = Y + 1.402·Cr`, full-res
Y carries the structure). Blocky tiles divide or subtract luma away
(Saturation `= (max−min)/max`, Chroma `= max−min`, Warm/cool,
Hue·flat·steps), leaving pure half-res colour with nothing to mask the
block edges.

Measured on the new Lady Agnew (5000×6324): header declares
`chromaSubsampling: 4:2:0`; 57.7% of 2×2 blocks are constant colour over
varying brightness — the strongest subsampling signature measured.

## Decision

Three layers, one deliberately skipped:

1. **Detect and surface.** `lib/image-details.ts` reads the per-component
   sampling factors from the JPEG SOF marker (3 bytes per component right
   after the count it already parsed). The library panel shows a
   `Chroma 4:2:0 · ½-res colour` row in amber when subsampled, plain
   `4:4:4 (full res)` otherwise. Non-JPEG formats show no row.
2. **Smooth, behind a toggle** — trialled in the floating display
   toolbar, then **demoted to Settings → Labs the same morning**: Taylor
   judged the effect "no noticeable effect" in practice (the 3×3 kernel
   softens 2×2 stairs but barely dents the 16×16 quantization blocks that
   dominate at 1:1). The shader path stays; persist v7 resets the flag
   off once. `smoothChromaSample()` in the fragment
   shader: keep the pixel's stored luma, average Cb/Cr over a 3×3 tent of
   source texels, reassemble. Runs in sRGB-space BT.601 YCbCr — the space
   the file was subsampled in — then returns to linear. Applied to the
   input sample, so all nine tiles share one consistent image; luma-heavy
   tiles barely change. CPU-tweened uniform (`uChromaSmooth`), branch
   skipped entirely at 0.
3. **Reconstruction — flagged, not built.** Luma-guided chroma upsampling
   (joint bilateral / guided filter) as a one-time offscreen pass at load
   would look sharpest but *invents* plausible colour aligned to luma
   edges. Taylor: skip for now, revisit if smoothing proves insufficient.
   If built: offscreen render-to-texture at image load, zero per-frame
   cost, clearly labelled as reconstruction.

## Why smoothing over reconstruction

Smoothing only redistributes what the file stores — a 2×2 stair becomes
the gradient the encoder threw away the shape of. Honest, cheap (8 extra
taps, magnification-only in effect), and reversible per toggle-flip.
Reconstruction changes what the readouts would disagree with: the CPU
readout path samples the decoded file, and inventing GPU-side colour
would make the eyedropper contradict the tiles.

## Constraints carried forward

- The smoothing taps offset by ±1 *source texel*; under minification the
  taps collapse into one mip texel and the effect vanishes. That is
  correct behaviour (artifacts only exist under magnification) but it
  means **the toggle shows nothing at fit zoom** — verify it zoomed in.
- 3×3 cannot erase 16×16 quantization blocks; it softens their borders.
  Heavier repair is Layer 3 territory.
- YCbCr constants are full-range BT.601 (what JFIF JPEG uses). Don't
  swap in BT.709 without a reason.
- Prevention beats mitigation: PNG, lossless WebP, or 4:4:4 JPEG sources
  have no artifact to hide. Wikimedia's "original file" links usually
  bypass the 4:2:0 derivative JPEGs.

See [[decision-chroma-neutral-detection]] for the adjacent shadow-noise
issue (different mechanism, same tiles).
