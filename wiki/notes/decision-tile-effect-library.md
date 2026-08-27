---
tags: [domain/rendering, status/draft]
---

# Decision: Tile Effects Become a Hot-Swappable Library

**Date:** 2026-08-26 · **Status:** draft (branch `feature/hue-tile-variants`, unmerged)

## Context

Exploring alternatives for the hue tiles, Taylor flagged the real
requirement mid-session: *"I'm going to ask for some rapid fire changes on
some of these tiles, so let's make sure the system is modular enough to
support that"*, then *"the effects applied to tiles should be able to be
hot-swapped, and we should be able to keep a library of effects that we may
want to load/unload based on user choice."*

The shader had grown an `if (tileIndex == N)` chain, so what a tile showed
was welded to where it sat. Trying a new treatment meant editing that chain,
the `TILE_NAMES` array, and any interaction code that hard-coded a position
(`HUE_MAP_TILE = 3` existed in two separate files).

## Decision

A registry in `lib/tile-transforms.ts` is the single source of truth: each
effect has a stable shader-side `id`, a full `name`, a `short` label, and a
`blurb`. The shader gains `uniform float uTileTransform[9]` and one
`applyTransform(id, color, out tint, out isChannel)` dispatcher; `main()`
looks up the id for its position and calls it.

Consequences that fall out of this:

- **Adding an effect is two edits** — a GLSL function plus a dispatcher
  branch, and a registry row. Nothing else.
- **Rearranging the grid is data** — `DEFAULT_LAYOUT`, a preset, or a click.
- **Position couplings are gone.** `hueMapTileIndex(layout)` finds the hue
  map wherever it is, so hover retargeting and the hexagon's twilight ring
  follow it. `HUE_MAP_TILE` is deleted from both files.
- **The RGB tint travels with the effect**, not with the bottom row, via the
  `isChannel` out-param — so Red can sit anywhere and still cross-fade.
- Stored layouts pass through `normalizeLayout`, so a retired or renamed
  effect degrades to the shipping effect for that position rather than
  breaking the grid.

Two ways to drive it: a 3×3 compass grid in Settings → Labs, and
**right-click on a tile** for an in-place picker.

## Why

Every question this session was of the form *what if this tile showed X
instead* — see [[backlog-interactivity-ideas]] for the hot-swap item this
finally delivers. The bottleneck was never the shader maths (each effect is
3–10 lines); it was that trying one cost a round-trip through four files.

## Constraints carried forward

- **ESSL 1.00 forbids indexing a uniform array by a computed value.** The
  lookup is a `for (int i = 0; i < 9; i++) if (i == tileIndex)` loop,
  because a loop index *is* a constant-index-expression. Do not "simplify"
  it to `uTileTransform[tileIndex]` — it will not compile.
- **Shader ids are stable and must never be renumbered.** Persisted layouts
  store effect *keys*, but the uniform carries ids; reusing an id for a
  different effect silently changes what stored layouts render.
- Right-click still pans: the button-down position is recorded and the menu
  only opens if travel on release is under 4px. The handler neither
  `preventDefault`s nor stops propagation, so MapControls is untouched.
