"use client";

import { useCallback, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { canvasBridge, useUiStore } from "@/stores/ui-store";
import {
  DEFAULT_TARGET_HUE,
  FRAME_MARGIN,
  fitAllZoom,
  gridScreenRect,
  insetCenter,
  tileRect,
  type CanvasCursor,
} from "./geometry";
import type { SceneRef } from "./scene-state";

type ControlsLike = {
  target?: THREE.Vector3;
  saveState?: () => void;
} | null;

/**
 * Owns the camera: framing a tile, returning to the fitted grid, the
 * tween between the two, focus-mode dissolve on zoom-out, and the refit
 * when a new image lands. Registers the bridge callbacks the DOM shell
 * uses (refit on double-click outside, grid rect for PNG export).
 *
 * Owns `viewGoal`, `zoomedTile`, `framedZoom` in SceneState.
 */
export function useCameraFraming(
  sceneRef: SceneRef,
  aspect: number,
  texture: THREE.Texture | null,
  onCursor: (cursor: CanvasCursor) => void,
) {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls);

  const applyView = useCallback(
    (x: number, y: number, zoom: number, snap: boolean) => {
      const st = sceneRef.current;
      const { camera, controls } = get();
      if (snap && camera instanceof THREE.OrthographicCamera) {
        st.viewGoal = null;
        camera.position.set(x, y, camera.position.z);
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
        (controls as ControlsLike)?.target?.set(x, y, 0);
      } else {
        st.viewGoal = { x, y, zoom };
      }
      invalidate();
    },
    [get, invalidate, sceneRef],
  );

  const frameTile = useCallback(
    (tile: number, snap = false) => {
      const st = sceneRef.current;
      const { size } = get();
      const insets = useUiStore.getState().viewInsets;
      st.zoomedTile = tile;
      useUiStore.getState().setFramedTile(tile);
      const r = tileRect(tile, aspect);
      const zoom =
        Math.min(
          (size.width - insets.right) / r.w,
          (size.height - insets.top) / r.h,
        ) * FRAME_MARGIN;
      st.framedZoom = zoom;
      const c = insetCenter(r.cx, r.cy, zoom, insets);
      applyView(c.x, c.y, zoom, snap);
    },
    [applyView, aspect, get, sceneRef],
  );

  const unframe = useCallback(
    (snap = false) => {
      const st = sceneRef.current;
      st.zoomedTile = null;
      st.peek = false;
      useUiStore.getState().setFramedTile(null);
      const { size } = get();
      const insets = useUiStore.getState().viewInsets;
      const zoom = fitAllZoom(size, aspect, insets);
      const c = insetCenter(0, 0, zoom, insets);
      applyView(c.x, c.y, zoom, snap);
    },
    [applyView, aspect, get, sceneRef],
  );

  // A user grabbing the controls takes over from any in-flight camera
  // tween, and the cursor flips to a grabbing hand for the drag.
  useEffect(() => {
    if (!controls) return;
    const ctl = controls as unknown as THREE.EventDispatcher<{
      start: object;
      end: object;
    }>;
    const onStart = () => {
      const st = sceneRef.current;
      st.viewGoal = null;
      if (!st.pinDrag) onCursor("grabbing");
    };
    const onEnd = () => onCursor("reticle");
    ctl.addEventListener("start", onStart);
    ctl.addEventListener("end", onEnd);
    return () => {
      ctl.removeEventListener("start", onStart);
      ctl.removeEventListener("end", onEnd);
    };
  }, [controls, onCursor, sceneRef]);

  useEffect(() => {
    canvasBridge.refit = () => unframe();
    return () => {
      canvasBridge.refit = null;
    };
  }, [unframe]);

  // Where the grid sits on the canvas right now, in device px — PNG
  // export crops to this instead of shipping the letterbox flanks and
  // the dead space under the header/panel.
  useEffect(() => {
    canvasBridge.gridScreenRect = () => {
      const { camera, size, gl } = get();
      if (!(camera instanceof THREE.OrthographicCamera)) return null;
      return gridScreenRect(aspect, camera, size, gl.getPixelRatio());
    };
    return () => {
      canvasBridge.gridScreenRect = null;
    };
  }, [aspect, get]);

  // Fit the view when a new image arrives; reads the store imperatively
  // so a window resize never yanks a view the user has panned. Pin and
  // peek state belong to the previous image — clear them. A FRAMED tile
  // survives the swap: the camera re-frames the same grid position
  // against the new image's aspect instead of resetting to the full grid.
  useEffect(() => {
    if (!texture) return;
    const st = sceneRef.current;
    const { camera, size, controls: ctl } = get();
    const c = ctl as ControlsLike;
    st.viewGoal = null;
    st.hueGoal = DEFAULT_TARGET_HUE;
    st.pinUv = null;
    st.peek = false;
    const ui = useUiStore.getState();
    ui.setPinnedColor(null);
    ui.setPinnedTile(null);
    const framed = st.zoomedTile;
    if (framed !== null) {
      // Snap, not tween: the image under the camera changed, so easing
      // from the old aspect's position would read as a drift.
      frameTile(framed, true);
      return;
    }
    ui.setFramedTile(null);
    const insets = ui.viewInsets;
    const zoom = fitAllZoom(size, aspect, insets);
    const center = insetCenter(0, 0, zoom, insets);
    camera.position.set(center.x, center.y, 5);
    c?.target?.set(center.x, center.y, 0);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
    c?.saveState?.();
    invalidate();
  }, [texture, aspect, get, invalidate, frameTile, sceneRef]);

  // The camera tween, and focus-mode dissolve. Registered before the
  // uniform sync so a frame's outlines are computed from the camera
  // position they will be drawn at.
  useFrame((state, rawDt) => {
    // Demand-mode frames can arrive after long idle gaps; an unclamped
    // delta makes every ease complete in one frame. Clamp to a 30fps step.
    const st = sceneRef.current;
    const dt = Math.min(rawDt, 1 / 30);
    let active = false;

    const goal = st.viewGoal;
    if (goal && state.camera instanceof THREE.OrthographicCamera) {
      const camera = state.camera;
      const k = 1 - Math.exp(-8 * dt);
      camera.position.x += (goal.x - camera.position.x) * k;
      camera.position.y += (goal.y - camera.position.y) * k;
      camera.zoom += (goal.zoom - camera.zoom) * k;
      const settled =
        Math.abs(goal.x - camera.position.x) < 1e-4 &&
        Math.abs(goal.y - camera.position.y) < 1e-4 &&
        Math.abs(goal.zoom - camera.zoom) / goal.zoom < 1e-3;
      if (settled) {
        camera.position.set(goal.x, goal.y, camera.position.z);
        camera.zoom = goal.zoom;
        st.viewGoal = null;
      }
      camera.updateProjectionMatrix();
      (state.controls as unknown as ControlsLike)?.target?.set(
        camera.position.x,
        camera.position.y,
        0,
      );
      active = true;
    }

    // Zooming out well past the framed-tile zoom dissolves focus mode:
    // the title unlocks and framing state clears without moving the
    // camera. Skipped mid-tween (the tween passes through lower zooms).
    if (
      st.zoomedTile !== null &&
      !st.viewGoal &&
      state.camera instanceof THREE.OrthographicCamera &&
      state.camera.zoom < st.framedZoom * 0.75
    ) {
      st.zoomedTile = null;
      st.peek = false;
      useUiStore.getState().setFramedTile(null);
    }

    if (active) invalidate();
  });

  return { frameTile, unframe };
}
