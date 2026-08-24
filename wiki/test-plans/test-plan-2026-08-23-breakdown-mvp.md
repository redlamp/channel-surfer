# Test Plan — 2026-08-23 — Breakdown MVP + Pan/Zoom

Shader math is already verified on-GPU (per-tile pixel readback against the
SMPTE demo). These are the visual/interaction checks that need eyes on the
browser pane (R3F can't render in a hidden tab).

Run `bun run dev` → http://localhost:7847

- [ ] Page loads with the SMPTE bars demo in a 3×3 grid, fitted to view
- [ ] Grid matches the reference mock: row 1 source / hue-shaded /
      hue-flat, row 2 hue-map / saturation / brightness, row 3 red /
      green / blue
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

## Tile interactivity (added later on 2026-08-23)

- [ ] Hovering any tile shows a white outline around it and a floating
      label above the canvas naming the tile (the old label grid is gone)
- [ ] Hovering the Hue map tile: cursor becomes a crosshair with a center
      gap; the hue map recalibrates so the hovered pixel's hue reads as
      white, easing smoothly as you move
- [ ] Moving off the Hue map tile: the map tweens back to the 180° target
      (not a snap)
- [ ] Hovering a grey pixel on the hue map holds the current target
      instead of jumping
- [ ] Double-click a tile → camera tweens to frame just that tile;
      double-click it again → tweens back to the full grid
- [ ] Grabbing/panning mid-tween cancels the tween without fighting you
- [ ] Single-click any R/G/B tile → all three cross-fade between
      black-to-white and black-to-color (red/green/blue tints)
- [ ] Double-clicking an R/G/B tile frames it WITHOUT toggling the
      colorize mode (single-click waits out the double-click window)
- [ ] A drag that ends on an R/G/B tile does not toggle the mode

## Restyle + settings + library (evening 2026-08-23)

- [ ] App is in Barlow / Share Tech Mono, anodised dark theme (page a
      step darker than panels, hairline borders); no white flash when
      hovering across RGB tiles in color mode
- [ ] All UI text reads at 16px (no small text anywhere)
- [ ] Settings (gear) opens a right-edge sheet; "Hue highlight on hover"
      Off / Hue tile / All tiles works live and persists across refresh
- [ ] With "All tiles": hovering ANY tile recalibrates the hue map and
      shows the reticle cursor; "Hue tile" restricts it; "Off" disables
- [ ] Library button toggles the right panel; dropping several files at
      once adds them all and selects the last
- [ ] Library rows: thumbnail, name, resolution; click switches the grid;
      trash removes (falls back to the newest remaining, then demo)
- [ ] Details block shows format / color mode / bit depth / file size for
      the selection (try a PNG and a JPEG; JPEG should also show
      Baseline/Progressive)
- [ ] Refresh: library, selection, and settings all survive

## Big batch (late 2026-08-23)

- [ ] Header title reads "Channel Surfer 🏄🌈"; hover + pinned colors show
      as two stable rows (no jitter as digits change); click copies hex
- [ ] HSB↔HSL setting flips tiles 4/5, the readout rows, and the steps
- [ ] "Color steps" setting shows the equations strip under the canvas
- [ ] Hue map style setting: warm/cool vs glow vs bands, live
- [ ] Crosshair cursor everywhere over the canvas
- [ ] Hover shows a small 50%-alpha echo ring at the matching spot on the
      other eight tiles; rings look smooth (no jaggies)
- [ ] Single-click pins (larger ring on all tiles + header row);
      clicking the pin or Esc clears; double-click doesn't accidentally pin
- [ ] Hovering an RGB tile shows the Tint bar below it (White | Color);
      the bar is reachable without flickering away
- [ ] Framed tile leaves visible slivers of neighbors; double-clicking a
      sliver moves focus there; double-click outside the grid recenters
- [ ] In focus mode the title widget stays centered showing the tile name,
      with the mask button: isolate hides all other tiles
- [ ] Holding Space in focus mode peeks the source image; release restores
- [ ] Export button downloads the current view as a PNG
- [ ] Adding images auto-opens the Media Library; PgUp/PgDn step between
      library images
- [ ] While zoomed into a tile: arrow keys SNAP between tiles — left and
      right wrap through the reading order (tile 2 → 3, 8 → 0), up and
      down clamp at the top/bottom rows; double-click still returns to
      the full grid with its tween
- [ ] In color mode, sweeping the cursor across all nine tiles produces
      zero flicker on the RGB tiles (the uniforms-reset bug is gone)
- [ ] Hue retarget on the hue tile snaps instantly with cursor movement
- [ ] Library starts closed; highlight setting reads "Hue tile" even if
      you previously had "All tiles" stored (one-time migration)
