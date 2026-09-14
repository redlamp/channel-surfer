# Display Tools and Export

## Context

Tile names and controls were difficult to discover. Export cropped the live canvas, making the result depend on the camera position. Uniform controls differed and lost saturation values when toggled.

## Decision

- Tags button beside HSB/HSL toggles labels centered at the top of each tile, on a translucent white scrim.
- SlidersHorizontal toggles selected-tile controls in Inspect; enabling opens that tab. The last inspected tile remains available when leaving the canvas, with framed/pinned selections also respected.
- A grouped set of header buttons provides zoom out, zoom in, physical-pixel 1:1, and Fit around open panels.
- Both Hue Uniform toggles disable their sliders when off, retain original channel variation, and restore previous values when re-enabled.
- Export renders the full grid into an offscreen WebGL target at 1536, 3072, or 6144 pixels on the longest edge, subject to GPU limits. Optional names are composited locally. Cursor rings, selection outlines, isolation and source peek are excluded.
- Reset, undo/redo and named presets are tracked in GitHub issue #3.

## Why

These controls expose existing capabilities, make experimentation consistent and produce shareable comparisons independently of the workspace camera.

## Constraints Carried Forward

No image upload, no changes to the live camera during export, explicit sRGB conversion remains in the shader. The 1:1 action maps one source pixel to one physical display pixel. Validate export pixel values and camera independence in the browser suite.

Related: [[decision-hue-tile-controls]], [[decision-library-left-panel]].
