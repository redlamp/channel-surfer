---
tags: [domain/process, status/adopted]
---

# Session Handoff — 2026-08-24

The project was built in one long Claude Code session rooted in the OLD
Gigi prototype folder (`C:\workspace\ImageView`, app project name
"ImageViewerGigi"). From here on, sessions run in this repo directly.
This note is the bridge; the chat transcript stays filed under the old
project and everything that matters lives in this wiki.

## State as of handoff

- **v0.1 is live**: `main` deployed to
  https://redlamp.github.io/channel-surfer/ (dev slot at `/dev`).
  `dev` and `main` are in sync.
- Full feature state, decision history, and the bug war stories are in
  [[../daily/2026-08-23|the kickoff daily note]] — read it top to bottom
  for the whole arc (flicker root cause, snap-vs-tween calls, hue-map
  research, PowerShell 5.1 gotchas).
- Conventions live in the repo root `AGENTS.md` (via `CLAUDE.md`):
  3-tier branching, port 7847, sRGB discipline, wiki rules.

## Open threads for the next session

1. **Test plan sweep** — [[../test-plans/test-plan-2026-08-23-breakdown-mvp]]
   has grown all day and most boxes are untried by human eyes.
2. **Feel knobs flagged for tuning**: hexagon card ease (9/s) and gap
   (16px), pin grab radius (12px), tint fade duration (350ms).
3. **Backlog** ([[backlog-interactivity-ideas]]): displacement maps from
   channels, tile hot-swapping, video + webcam sources, in-tile labels.
4. **Hue map**: twilight shipped as default; the four Labs styles await
   a verdict on whether any should be culled outright.
5. Whether `Color steps` / `Hexagon` should default on for new visitors.

## Session-move mechanics (for Taylor)

- Open this folder (`C:\workspace\channel-surfer`) in the Claude Code
  app to start new sessions here; `CLAUDE.md` + this wiki carry the
  context, no transcript needed.
- The old ImageView project remains the Gigi archive; its only role now
  is history.
