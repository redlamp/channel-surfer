---
tags: [domain/tooling, status/adopted]
---

# Decision: Web Refactor — Repo, Stack, Deploy

**Date:** 2026-08-23 · **Status:** adopted

## Context

The Gigi prototype (ImageViewerGigi) proved the 3×3 channel-breakdown idea
but is locked to Gigi's runtime. Taylor wants a web tool, continuing the
2020 tweet concept. An earlier Godot attempt (Image-Breakdown) stalled at a
dissolve-shader demo.

## Decision

- **Fresh repo** `redlamp/channel-surfer`, local `C:\workspace\channel-surfer`.
  ImageViewerGigi stays as the archived reference. Fresh repo avoids the
  Windows folder-name collision with the old `Image-Breakdown` Godot dir.
- **Name:** repo slug `channel-surfer`, display title **Channel Surfer**.
- **Stack:** Next.js 16 (App Router) + React Three Fiber + shadcn (base-ui)
  + Tailwind v4 + zustand + Bun — the wright-angles/starry-night pattern.
- **Deploy:** GitHub Pages static export from `main`, gated behind
  `NEXT_OUTPUT_EXPORT=1`; dev slot at `/channel-surfer/dev` (wright-angles
  workflow pattern).
- **Branching:** 3-tier `main` ← `dev` ← `feature/*`, `--no-ff`, manual
  dev→main promotion.
- **Images are local-only:** no uploads anywhere; File → IndexedDB
  (wright-angles `lib/idb.ts` pattern) → object URL → three texture.
- **MVP scope:** image upload + the 3×3 breakdown grid. Video/webcam later.

## Why

- Matches every recent project's stack, so existing gotcha knowledge
  (shadcn base-ui traps, R3F strict-mode context loss, Pages deploy
  wedges) carries over directly.
- Fully client-side tool → static export → free Pages hosting.

## Constraints carried forward

- Static export: no server actions, `images.unoptimized`, browser storage
  only.
- Fragment shader mirrors the HLSL's color discipline: sample linear
  (sRGB texture decode), compute, explicit linear→sRGB at the end.
- The Gigi mouse/persistent-data click experiment is superseded by the
  richer interactivity plans in [[backlog-interactivity-ideas]].
