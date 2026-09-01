---
tags: [domain/tooling, status/adopted]
---

# Decision: Verify With a Pixel-Readback Suite, Not Screenshots

**Date:** 2026-09-01 · **Status:** adopted

## Context

Through v0.3.1 every shader change was verified by hand: a headless pixel
probe written for the occasion, or a screenshot in the Browser pane. The
pane pauses `requestAnimationFrame` while hidden, so WebGL frames and
camera tweens stall between screenshots and were twice mistaken for bugs.
Each verification round also cost a lot of context for an agent, and
nothing locked the twenty effects in place once a session ended.

## Decision

Three layers, cheapest first, wired into `bun run check` and CI:

1. **Unit tests with `bun test`** (`tests/unit`, ~0.1s): the CPU colour
   maths, the effect registry and layout repair, the image header parser,
   canvas geometry, and the settings migration (extracted to
   `stores/settings-migrate.ts` so it can be tested without zustand's
   persistence).
2. **Shader tests with Playwright** (`tests/e2e`, ~5s): headless Chromium
   renders the app, the test reads pixels back off the WebGL canvas
   (`preserveDrawingBuffer` was already on for PNG export) and checks
   every tile effect against the Source tile's own pixels, using the same
   maths in TypeScript. No image-specific expectations; a second grid
   covers the effects the shipping grid does not. Points near an edge in
   the image are skipped, because the minified grid lands on a different
   texel blend in each tile.
3. **Screenshots** stay for layout and UI only.

`ci.yml` runs all three on push to `dev` and `main`; the Pages deploy
keeps its typecheck-only gate so a flaky browser run never blocks a
release.

## Why

- A shader regression is now a red test naming the effect and the pixel,
  not something noticed on a demo image weeks later.
- For an agent, `bun run check` plus one e2e line per test is a few
  hundred tokens; a screenshot round is thousands, and less conclusive.
- The `window.__channelSurfer` bridge the test uses (grid rect, tile
  under a point) doubles as a DevTools affordance.

## Constraints carried forward

- Adding an effect means adding its expectation to `expected()` in
  `tests/e2e/shader.e2e.ts`, or the new tile silently goes unchecked.
- The e2e tolerance is ±4 of 255 (texture round trip). Tighten only with
  a reason.
- The warm/cool effect has no e2e expectation yet (the Color-blend
  branch is long to mirror); it is exercised but not asserted.
- `bun test` picks up `*.test.*` and `*.spec.*`; the Playwright files use
  `.e2e.ts` so the two runners never see each other's files.
