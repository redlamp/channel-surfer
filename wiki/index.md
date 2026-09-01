# Channel Surfer — Wiki Index

Break an image into its RGB and HSB channels. Web refactor of the Gigi
prototype (ImageViewerGigi), rooted in a 2020 tweet idea about splitting
video into channels to teach how shaders see color.

## MOCs

- [[decisions]] — adopted/open decisions
- [[backlog]] — feature ideas and future work

## Key notes

- [[decision-web-refactor-stack]] — why Next.js/R3F/shadcn, repo, deploy
- [[decision-tile-effect-library]] — any effect on any tile; how to add one
- [[decision-chroma-neutral-detection]] — chroma, not saturation, decides neutral
- [[decision-chroma-subsampling-response]] — 4:2:0 sources: detect, smooth, never invent
- [[decision-verification-harness]] — `bun run check` + Playwright pixel readback
- [[wide-gamut]] — where the app stands on Display P3
- [[backlog-interactivity-ideas]] — Taylor's future-feature wishlist
- [[session-handoff-2026-08-24]] — bridge from the kickoff session
  (rooted in the old ImageView folder) to sessions in this repo

## Origin

- Gigi prototype: `C:\workspace\ImageView` / github.com/redlamp/ImageViewerGigi
- Abandoned Godot attempt: `C:\workspace\Image-Breakdown` (dissolve-shader
  demo only; never reached the breakdown theme)
