# Hue Tile Controls

## Context

The shaded, flat, lit and mid Hue effects differed mainly in saturation and brightness, cluttering the effect picker.

## Decision

Expose one Hue tile with controls beneath the hovered tile. Saturation and brightness use 0-100% sliders. Both toggles are labelled Uniform: checked applies a uniform slider value; unchecked retains source variation. Both sliders are disabled when Uniform is off and preserve their previous values for re-enabling. Both readouts reserve three monospaced digit positions plus the percent sign. Uniform brightness removes source shading; the brightness slider sets the uniform level when enabled, and source brightness is retained when disabled. Settings belong to each grid position, allowing side-by-side comparisons.

Existing layouts migrate to Hue with equivalent settings, except that the old Flat neutral split is intentionally removed. The Factorial preset still creates its original combinations. Hue flat steps stays separate because its three-level neutral treatment is distinct.

## Why

The controls make the relationship between the old variants explicit while allowing intermediate values. Original saturation preserves the old Lit and Mid behavior.

## Constraints Carried Forward

Images stay local. Chroma-based neutral detection and explicit sRGB conversion remain in the shader. Neutral pixels follow the brightness setting throughout the saturation range. The old Flat black/white neutral split is removed from the unified Hue tile to avoid a jump at 100% saturation. Verify shader changes by pixel readback.

Related: [[decision-tile-effect-library]], [[decision-chroma-neutral-detection]].
