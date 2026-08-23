<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Channel Surfer

Web tool that breaks an image into RGB/HSB channel tiles via a fullscreen
GLSL shader. Port of the Gigi prototype in `C:\workspace\ImageView`
(github.com/redlamp/ImageViewerGigi).

## Conventions

- Stack: Next.js 16 + R3F + shadcn (base-ui) + Tailwind v4 + zustand. Bun.
- Branch flow: `main` ← `dev` ← `feature/*`, `--no-ff` merges, no squash.
  `dev` → `main` promotion only on Taylor's explicit go-ahead. `main` is the
  GitHub Pages deploy source.
- Dev server: `bun run dev` on port 7847.
- Static-export constraints: no server actions, no Next image optimization,
  images stay client-side (IndexedDB only — never uploaded anywhere).
- Project knowledge lives in `wiki/` (Obsidian vault) — read
  `wiki/CLAUDE.md` for conventions, `wiki/index.md` for the map. Decisions
  and rationale go in `wiki/notes/`, what-happened-today in `wiki/daily/`.
- sRGB discipline: textures load as sRGB (shader samples are linear); the
  fragment shader converts linear → sRGB explicitly at the end, matching the
  original HLSL. Don't add three's built-in color-space chunks on top.
