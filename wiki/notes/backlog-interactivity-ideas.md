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

## Click to zoom on panels — DONE 2026-08-23 (as double-click)

Double-click a tile frames it via a camera tween; double-click again
returns to the fitted grid. (Chosen over single-click so plain clicks stay
free for future picking interactions.)

## Hot-swap tile contents

Choose what each tile displays (from the full set of channel modes) instead
of the fixed 3×3 assignment. Implies a per-tile mode uniform (int array)
rather than the hardcoded switch on tile index.

## Settings

Expose the shader tunables (hue target, accent colors, saturation
threshold, brightness posterize stops) in a shadcn panel.

## Cursor-position response (hue recalibration) — DONE 2026-08-23

Hovering the hue tile recalibrates so the hovered pixel's hue becomes the
white point, tweening back to 180° on leave; gap-center crosshair cursor
marks the focus. This was the spiritual successor of the Gigi prototype's
mouse + persistent-data experiment. Remaining extension: cursor response
on the OTHER tiles (e.g. saturation/brightness thresholds from the hovered
pixel).

## Also deferred from the original idea

- Video file and webcam sources (the 2020 tweet was about video).
- In-tile text labels like the reference mock.
