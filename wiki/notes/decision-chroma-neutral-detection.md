---
tags: [domain/color, status/adopted]
---

# Decision: Neutral Detection Uses Chroma, Not Saturation

**Date:** 2026-08-26 · **Status:** adopted (shipped in v0.3, 2026-08-27)

## Context

Every hue-family effect has to answer *does this pixel's hue mean anything?*
before showing it. The shipping code answered with saturation: `flat` and
`shaded` tested `sat > 0.0`, the hue map used `satThresh = 0.01`.

Exact-zero is effectively dead code on photographs — an oil-painting scan
has essentially no pixel with saturation exactly 0, so the neutral branch
never ran and Taylor's black/white threshold on `flat` did nothing visible.
It also produced the shadow speckle: near-black pixels with a trace of
chroma noise exploding to full saturation.

The obvious repair is a small saturation tolerance. It does not work.

## Decision

Test **chroma** (`max − min`), not saturation, via one shared
`colorfulness()` in the shader, feathered with `smoothstep` across
0.75×–1.5× a tunable tolerance (default 5/255, Settings → Labs).

Detection is deliberately separate from appearance, so the two `flat`
variants keep their distinct neutral looks (two-way split at 50% vs the
Gigi original's three stops at 0.2/0.8) while both stop speckling.

## Why

Saturation divides chroma by `max`, and that division amplifies noise in the
shadows. Measured:

| pixel | saturation | chroma |
|---|---|---|
| shadow noise (2,2,3) | **0.333** | 0.004 |
| shadow noise (5,4,7) | **0.429** | 0.012 |
| midtone noise (128,128,131) | 0.023 | 0.012 |
| genuine dark red (51,0,0) | 1.000 | 0.200 |
| pale skin (235,200,185) | 0.213 | 0.196 |

A pixel one 255th off neutral reports 33% saturation purely because it is
nearly black, while real pale skin reports 21%. **The orderings overlap, so
no saturation threshold separates them.** Chroma has no such division: noise
lands at 0.004–0.012, real colour at ~0.20, leaving a 16× gap that any
cutoff near 0.02 sits safely inside.

Verified by compiling the shipped `imageFlat` headlessly at tolerance 5/255
and reading back pixels — shadow noise renders black, dark red stays red,
pale skin stays orange.

## Constraints carried forward

- Applied to **nine** effects at once (shaded, flat, flat·steps, lit, mid,
  families, warm/cool, contours, hue map). Any new hue-family effect should
  call `colorfulness()` rather than inventing its own test.
- `uNeutralTol` is clamped to `max(tol, 1e-5)` in the shader — a literal
  zero would make the `smoothstep` degenerate.
- Chroma is measured in whichever space the transform runs, so the same
  tolerance bites slightly differently under Linear vs sRGB. Consistent with
  every other effect, so left as-is. See [[decision-tile-effect-library]].
