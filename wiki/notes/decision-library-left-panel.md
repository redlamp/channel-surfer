# Library Left Panel

## Context

The media library shared the right inspector panel, making users switch away from color inspection to select images.

## Decision

Move the media library to its own 300px left overlay, with a toggle attached to its inner side and a close button inside the panel. Keep Inspect and Settings on the right, with their toggle attached to the panel’s inner side. The library starts closed; dropping images opens it without switching the right-hand tab. Image metadata remains in Inspect.

Both panels can stay open on desktop. On narrow screens they share the bottom-sheet space, with one visible at a time. Opening, closing or resizing panels leaves the camera unchanged; panels overlap the image by default. Double-clicking outside the image explicitly fits it using the current left/right or bottom-sheet insets. New images use the full workspace beneath the header by default. On narrow screens the active toggle attaches to the top of its sheet.

## Why

Image selection and inspection can happen side by side, with independent controls for available screen space.

## Constraints Carried Forward

Images remain local. Manual camera positioning is respected. The right panel retains its resizable width. Existing upload, selection, deletion and keyboard library navigation continue to use the source store.

Panel toggles use matching colors in both states and square edges where they join the panel. Panels and toggles slide over 180ms without changing the camera; reduced-motion preferences disable the transition.
