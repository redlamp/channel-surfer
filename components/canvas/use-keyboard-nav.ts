"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { SceneRef } from "./scene-state";

/**
 * Keyboard: arrows navigate tiles while framed (left/right wrap through
 * the reading order, up/down clamp), Escape unframes or clears the pin,
 * and holding Space peeks at the source over the framed tile.
 *
 * Owns `peek` in SceneState (with the camera hook, which clears it).
 */
export function useKeyboardNav(
  sceneRef: SceneRef,
  frameTile: (tile: number, snap?: boolean) => void,
  unframe: (snap?: boolean) => void,
  clearPin: () => void,
) {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const st = sceneRef.current;
      // Leave keys alone when a form control (e.g. the settings panel)
      // has focus.
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName))
      )
        return;

      if (e.key === "Escape") {
        if (st.zoomedTile !== null) {
          unframe();
        } else if (st.pinUv) {
          clearPin();
          invalidate();
        }
        return;
      }

      if (st.zoomedTile === null) return;

      if (e.key === " ") {
        e.preventDefault();
        if (!st.peek) {
          st.peek = true;
          invalidate();
        }
        return;
      }

      const cur = st.zoomedTile;
      let next: number | null = null;
      if (e.key === "ArrowLeft") next = (cur + 8) % 9;
      else if (e.key === "ArrowRight") next = (cur + 1) % 9;
      else if (e.key === "ArrowUp") next = cur - 3 >= 0 ? cur - 3 : cur;
      else if (e.key === "ArrowDown") next = cur + 3 <= 8 ? cur + 3 : cur;
      if (next === null) return;
      // Swallow the key even at the grid edge so the page never scrolls.
      e.preventDefault();
      // Snap, per Taylor — no camera tween on keyboard navigation.
      if (next !== cur) frameTile(next, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const st = sceneRef.current;
      if (e.key === " " && st.peek) {
        st.peek = false;
        invalidate();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [frameTile, unframe, clearPin, invalidate, sceneRef]);
}
