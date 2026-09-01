"use client";

import { useCallback, useEffect } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { pixelHue } from "@/lib/color";
import { hueMapTileIndex } from "@/lib/tile-transforms";
import { useSettingsStore } from "@/stores/settings-store";
import { canvasBridge, useUiStore } from "@/stores/ui-store";
import {
  CLICK_DELAY_MS,
  DEFAULT_TARGET_HUE,
  PLANE_H,
  TINT_BAR_GRACE_MS,
  tileFromUv,
  type CanvasCursor,
} from "./geometry";
import type { SceneRef } from "./scene-state";

/** Touch double-tap window and travel. */
const TAP_WINDOW_MS = 320;
const TAP_SLOP_PX = 32;
/** Touch pins wait out the double-tap window; mouse only the dblclick. */
const TOUCH_PIN_DELAY_MS = 340;
/** Press travel that arms the pin drag. */
const DRAG_ARM_PX = 4;
/** Clicking this close to the existing pin clears it. */
const PIN_HIT_PX = 12;

/**
 * The mesh's pointer handlers: hover sampling and hue picking, the pin
 * (click to place, drag to move, click again to clear), and double-click
 * / double-tap framing. Single clicks are held for the double-click
 * window so framing never also moves the pin.
 *
 * Owns `hueGoal`, `hoverUv`, `pinUv`, `clickTimer`, `pinDrag`,
 * `pointerPos`, `lastTap`, `loopDown` in SceneState.
 */
export function usePointerGestures(
  sceneRef: SceneRef,
  aspect: number,
  onHoverTile: (tile: number | null) => void,
  onCursor: (cursor: CanvasCursor) => void,
  frameTile: (tile: number, snap?: boolean) => void,
  unframe: (snap?: boolean) => void,
) {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(
    () => () => {
      const st = sceneRef.current;
      if (st.clickTimer !== null) window.clearTimeout(st.clickTimer);
    },
    [sceneRef],
  );

  /** The decoded pixel under an intra-tile UV, read on demand (1x1). */
  const readPixel = (u: number, v: number) => {
    const rc = sceneRef.current.readCtx;
    if (!rc) return null;
    const px = Math.min(Math.floor(u * rc.width), rc.width - 1);
    const py = Math.min(Math.floor((1 - v) * rc.height), rc.height - 1);
    const d = rc.ctx.getImageData(px, py, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], x: px, y: py };
  };

  /** Screen-pixel distance from an intra-tile UV to the current pin. */
  const pinDistPx = (u: number, v: number) => {
    const pin = sceneRef.current.pinUv;
    const { camera } = get();
    if (!pin || !(camera instanceof THREE.OrthographicCamera)) return Infinity;
    const pxPerU = camera.zoom * ((aspect * PLANE_H) / 3);
    const pxPerV = camera.zoom * (PLANE_H / 3);
    return Math.hypot((u - pin.u) * pxPerU, (v - pin.v) * pxPerV);
  };

  const setPinAt = (tile: number, u: number, v: number) => {
    const px = readPixel(u, v);
    if (!px) return;
    sceneRef.current.pinUv = { u, v };
    const ui = useUiStore.getState();
    ui.setPinnedColor({ ...px, u, v });
    // Pinning also selects the tile: white outline, and the inspector
    // falls back to it when nothing is hovered.
    ui.setPinnedTile(tile);
  };

  // Stable: the keyboard hook keys its listener registration on it.
  const clearPin = useCallback(() => {
    sceneRef.current.pinUv = null;
    useUiStore.getState().setPinnedColor(null);
    useUiStore.getState().setPinnedTile(null);
  }, [sceneRef]);

  const cancelClickTimer = () => {
    const st = sceneRef.current;
    if (st.clickTimer !== null) {
      window.clearTimeout(st.clickTimer);
      st.clickTimer = null;
    }
  };

  const toggleFrame = (tile: number) => {
    if (sceneRef.current.zoomedTile === tile) unframe();
    else frameTile(tile);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!e.uv) return;
    const st = sceneRef.current;
    st.pointerPos = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    const { tile, u, v } = tileFromUv(e.uv);
    // A second finger hands the gesture to the camera: abort any loop
    // drag and stop sampling until the pointers clear.
    if (canvasBridge.pointerCount > 1) {
      st.loopDown = null;
      if (st.pinDrag) {
        st.pinDrag = false;
        onCursor("reticle");
      }
      return;
    }
    // Arm the loop drag once the press travels a few pixels.
    if (st.loopDown && !st.pinDrag) {
      const dx = e.nativeEvent.offsetX - st.loopDown.x;
      const dy = e.nativeEvent.offsetY - st.loopDown.y;
      if (Math.hypot(dx, dy) > DRAG_ARM_PX) {
        st.pinDrag = true;
        // Hide the cursor so the loop's contents stay visible.
        onCursor("hidden");
      }
    }
    if (st.pinDrag) {
      setPinAt(tile, u, v);
      invalidate();
      return;
    }
    onHoverTile(tile);
    st.hoverUv = { u, v };
    const settings = useSettingsStore.getState();
    const picking =
      settings.highlightMode === "all" ||
      (settings.highlightMode === "tile" &&
        tile === hueMapTileIndex(settings.tileLayout));
    const px = readPixel(u, v);
    if (px) {
      useUiStore.getState().setHoverColor({ ...px, u, v });
      if (picking) {
        // Greys have no hue — hold the current target rather than jumping.
        const h = pixelHue(px.r, px.g, px.b, settings.colorMath === "linear");
        if (h !== null) st.hueGoal = h;
      }
    }
    if (!picking) st.hueGoal = DEFAULT_TARGET_HUE;
    invalidate();
  };

  const onPointerOut = () => {
    const st = sceneRef.current;
    onHoverTile(null);
    st.hoverUv = null;
    st.pointerPos = null;
    if (!st.pinDrag) onCursor("reticle");
    useUiStore.getState().setHoverColor(null);
    st.hueGoal = DEFAULT_TARGET_HUE;
    invalidate();
    // One more frame after the grace window so the context bar can hide.
    window.setTimeout(() => invalidate(), TINT_BAR_GRACE_MS + 50);
  };

  // Any primary-button (or one-finger) drag moves the selection loop —
  // the canvas itself pans with RMB / two fingers instead.
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !e.uv) return;
    if (canvasBridge.pointerCount > 1) return;
    sceneRef.current.loopDown = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
  };

  const onPointerUp = () => {
    const st = sceneRef.current;
    st.loopDown = null;
    if (!st.pinDrag) return;
    st.pinDrag = false;
    onCursor("reticle");
    invalidate();
  };

  // Single click pins (or unpins) the color sample. Held briefly so a
  // double-click (framing) doesn't also move the pin.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // Ignore drag-release "clicks" (delta = px between down and up) and
    // the trailing click of a multi-finger gesture.
    if (!e.uv || e.delta > DRAG_ARM_PX || canvasBridge.multiTouch) return;
    const st = sceneRef.current;
    const { tile, u, v } = tileFromUv(e.uv);
    const touch = (e.nativeEvent as PointerEvent).pointerType === "touch";

    // Touch double-tap = frame the tile: the canvas has touch-action
    // none, so the browser never synthesizes dblclick for taps.
    if (touch) {
      const now = performance.now();
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;
      const last = st.lastTap;
      st.lastTap = { t: now, x, y };
      if (
        last &&
        now - last.t < TAP_WINDOW_MS &&
        Math.hypot(x - last.x, y - last.y) < TAP_SLOP_PX
      ) {
        st.lastTap = null;
        cancelClickTimer();
        canvasBridge.meshDblAt = now;
        toggleFrame(tile);
        return;
      }
    }

    cancelClickTimer();
    st.clickTimer = window.setTimeout(
      () => {
        st.clickTimer = null;
        if (pinDistPx(u, v) < PIN_HIT_PX) clearPin();
        else setPinAt(tile, u, v);
        invalidate();
      },
      touch ? TOUCH_PIN_DELAY_MS : CLICK_DELAY_MS,
    );
  };

  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    canvasBridge.meshDblAt = performance.now();
    cancelClickTimer();
    if (!e.uv) return;
    toggleFrame(tileFromUv(e.uv).tile);
  };

  return {
    handlers: {
      onPointerMove,
      onPointerOut,
      onPointerDown,
      onPointerUp,
      onClick,
      onDoubleClick,
    },
    clearPin,
  };
}
