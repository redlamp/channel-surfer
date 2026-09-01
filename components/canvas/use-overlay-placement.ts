"use client";

import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSettingsStore } from "@/stores/settings-store";
import { canvasBridge } from "@/stores/ui-store";
import {
  TINT_BAR_GRACE_MS,
  barGroupOfTile,
  tileScreenBox,
} from "./geometry";
import type { SceneRef } from "./scene-state";

/**
 * Positions the two DOM overlays that follow tiles — the context bar
 * (Tint / Shade) under the hovered bar-carrying tile, and the hexagon
 * hover card beside the hovered tile — by writing their styles each
 * frame. Runs after the camera tween so it places against the frame's
 * final camera.
 *
 * Owns `lastBarTile`, `lastBarHoverAt`, `hexCardPos` in SceneState.
 */
export function useOverlayPlacement(sceneRef: SceneRef, aspect: number) {
  const invalidate = useThree((s) => s.invalidate);

  useFrame((state, rawDt) => {
    if (!(state.camera instanceof THREE.OrthographicCamera)) return;
    const cam = state.camera;
    const st = sceneRef.current;
    const dt = Math.min(rawDt, 1 / 30);
    let active = false;

    // Context bar: pinned below the last hovered bar-carrying tile, with
    // a short grace window so the cursor can cross the gap onto the bar.
    const bar = canvasBridge.tintBarEl;
    if (bar) {
      const barHover =
        st.hoverTile !== null &&
        barGroupOfTile(useSettingsStore.getState().tileLayout, st.hoverTile) !==
          null;
      if (barHover) {
        st.lastBarTile = st.hoverTile;
        st.lastBarHoverAt = performance.now();
      }
      const visible =
        (barHover ||
          canvasBridge.tintBarHover ||
          performance.now() - st.lastBarHoverAt < TINT_BAR_GRACE_MS) &&
        st.lastBarTile !== null;
      if (visible) {
        const b = tileScreenBox(st.lastBarTile as number, aspect, cam, state.size);
        bar.style.display = "flex";
        bar.style.left = `${(b.x0 + b.x1) / 2}px`;
        bar.style.top = `${Math.min(b.y1 + 8, state.size.height - 44)}px`;
      } else {
        bar.style.display = "none";
      }
    }

    // Hexagon hover card: sits OUTSIDE the hovered tile. Prefers the side
    // with more canvas room; when no side fits (a framed tile filling the
    // view), parks in the top-right corner. Loosely eased either way.
    const card = canvasBridge.hexCardEl;
    if (card) {
      const p = st.pointerPos;
      const tile = st.hoverTile;
      const wanted =
        p !== null && tile !== null && useSettingsStore.getState().showColorHexagon;
      if (wanted && tile !== null) {
        const cw = card.offsetWidth || 200;
        const chh = card.offsetHeight || 200;
        const { width: sw, height: sh } = state.size;
        const { x0, x1, y0, y1 } = tileScreenBox(tile, aspect, cam, state.size);
        const gap = 16;
        const clampX = (v: number) => Math.min(Math.max(v, 8), sw - cw - 8);
        const clampY = (v: number) => Math.min(Math.max(v, 8), sh - chh - 8);
        let gx: number;
        let gy: number;
        const fitsRight = x1 + gap + cw + 8 <= sw;
        const fitsLeft = x0 - gap - cw >= 8;
        const fitsBelow = y1 + gap + chh + 8 <= sh;
        const fitsAbove = y0 - gap - chh >= 8;
        // Locked per tile: the target only changes when the hovered tile
        // (or the camera) does, so the card sits still within a tile and
        // tweens between spots as focus moves. Edge columns prefer their
        // outward side so the card leaves the tiled area entirely when
        // the letterbox space allows.
        const col = tile % 3;
        if (col === 0 && fitsLeft) {
          gx = x0 - gap - cw;
          gy = clampY((y0 + y1) / 2 - chh / 2);
        } else if (col === 2 && fitsRight) {
          gx = x1 + gap;
          gy = clampY((y0 + y1) / 2 - chh / 2);
        } else if (fitsRight || fitsLeft) {
          gx = fitsRight && (!fitsLeft || sw - x1 >= x0) ? x1 + gap : x0 - gap - cw;
          gy = clampY((y0 + y1) / 2 - chh / 2);
        } else if (fitsBelow || fitsAbove) {
          gy = fitsBelow && (!fitsAbove || sh - y1 >= y0) ? y1 + gap : y0 - gap - chh;
          gx = clampX((x0 + x1) / 2 - cw / 2);
        } else {
          gx = sw - cw - 8;
          gy = 8;
        }
        const prev = st.hexCardPos ?? { x: gx, y: gy };
        const k = 1 - Math.exp(-9 * dt);
        const cur = {
          x: prev.x + (gx - prev.x) * k,
          y: prev.y + (gy - prev.y) * k,
        };
        st.hexCardPos = cur;
        card.style.display = "block";
        card.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
        if (Math.hypot(gx - cur.x, gy - cur.y) > 0.5) active = true;
      } else {
        card.style.display = "none";
        st.hexCardPos = null;
      }
    }

    if (active) invalidate();
  });
}
