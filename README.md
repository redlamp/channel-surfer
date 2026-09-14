# Channel Surfer

Break an image into its RGB and HSB channels to see how each contributes to
the final picture. A 3×3 tile grid renders the source alongside hue,
saturation, brightness, and per-channel breakdowns — all computed in a single
fragment shader.

A web refactor of the earlier Gigi prototype
([ImageViewerGigi](https://github.com/redlamp/ImageViewerGigi)), which itself
grew out of a 2020 idea: a shader that splits video content into channels to
show how RGB and HSB build a final image.

## Stack

- Next.js 16 (App Router, static export for GitHub Pages)
- React Three Fiber / three.js — fullscreen quad + GLSL fragment shader
- shadcn (base-ui) + Tailwind v4
- zustand for state, IndexedDB for the image library

Images never leave the browser — files are read locally and persisted in
IndexedDB only.

## Development

```bash
bun install
bun run dev        # http://localhost:7847
bun run check      # lint + typecheck + unit tests (tests/unit, ~0.1s)
bun run test:e2e   # Playwright shader suite: reads pixels off the WebGL
                   # canvas and checks every tile effect (tests/e2e, ~5s)
```

CI runs all of the above on every push to `dev` and `main`.

## Deploy

Pushes to `main` build a static export and publish to GitHub Pages at
`/channel-surfer` (with `dev` built best-effort at `/channel-surfer/dev`).
Branch flow: `main` ← `dev` ← `feature/*`; `dev` → `main` promotion is manual
and tagged (`v0.4.0` is current).

## Project wiki

Decisions, backlog, and daily notes live in [`wiki/`](wiki/index.md)
(an Obsidian vault checked into the repo).
