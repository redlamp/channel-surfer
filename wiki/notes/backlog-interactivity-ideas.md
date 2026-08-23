---
tags: [domain/product, status/open]
---

# Backlog: Interactivity Ideas

**Date:** 2026-08-23 · from Taylor, during project kickoff.

Future features beyond the MVP grid, in Taylor's words (paraphrased):

## Displacement maps from channels

Since we're on three.js: let any channel (hue, saturation, brightness, R/G/B)
drive a displacement map over the image — the 2D breakdown becomes a 3D
relief. Natural fit for a plane with subdivisions + vertex displacement from
the same texture the fragment shader reads.

## Click to zoom on panels

Click a tile to expand it (single-tile view), click again / esc to return to
the grid. Pairs well with tile hot-swapping.

## Hot-swap tile contents

Choose what each tile displays (from the full set of channel modes) instead
of the fixed 3×3 assignment. Implies a per-tile mode uniform (int array)
rather than the hardcoded switch on tile index.

## Settings

Expose the shader tunables (hue target, accent colors, saturation
threshold, brightness posterize stops) in a shadcn panel.

## Cursor-position response (hue recalibration)

Hovering a tile feeds the cursor position to the shader. Flagship example:
hovering the hue tile recalibrates so the hovered pixel's hue becomes the
baseline — hues above/below are color-coded relative to it. This is the
spiritual successor of the Gigi prototype's mouse + persistent-data
experiment (click hue picking, double-click detection).

## Also deferred from the original idea

- Video file and webcam sources (the 2020 tweet was about video).
- In-tile text labels like the reference mock.
