# Test Plan — 2026-08-23 — Breakdown MVP + Pan/Zoom

Shader math is already verified on-GPU (per-tile pixel readback against the
SMPTE demo). These are the visual/interaction checks that need eyes on the
browser pane (R3F can't render in a hidden tab).

Run `bun run dev` → http://localhost:7847

- [ ] Page loads with the SMPTE bars demo in a 3×3 grid, fitted to view
- [ ] Grid matches the reference mock: row 1 source / hue-mid / hue-max,
      row 2 hue-map / saturation / brightness, row 3 red / green / blue
- [ ] Drag pans; wheel zooms toward the cursor (Figma feel)
- [ ] Zoomed way in, source pixels are crisp squares (nearest filtering)
- [ ] Drag-drop an image anywhere on the page → grid swaps, view refits,
      aspect ratio matches the file
- [ ] "Open image" button does the same via the file picker
- [ ] Refresh → your image comes back (IndexedDB persistence)
- [ ] "Demo image" button restores SMPTE bars and clears the stored image
- [ ] Drop a non-image file → footer shows a readable error, app keeps
      working
- [ ] Portrait-orientation image → grid is portrait, no stretching
