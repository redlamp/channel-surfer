"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import { Focus } from "lucide-react";
import * as THREE from "three";
import {
  breakdownFragmentShader,
  breakdownVertexShader,
} from "@/lib/shaders/breakdown";
import { HexagonInner } from "@/components/color-hexagon";
import { useSourceStore } from "@/stores/source-store";
import { useSettingsStore } from "@/stores/settings-store";
import { canvasBridge, useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const HUE_STYLE_INDEX = {
  warmcool: 0,
  glow: 1,
  twilight: 2,
  diamond: 3,
  crawl: 4,
} as const;

/** World-space height of the 3x3 grid plane; width is aspect x this. */
const PLANE_H = 1;
const FIT_MARGIN = 0.94;
/** Framed-tile margin: slivers of the neighbors stay visible so they can
 * be double-clicked directly. */
const FRAME_MARGIN = 0.88;
/** Resting hue-map target: 180 degrees. */
const DEFAULT_TARGET_HUE = 0.5;
/** Tile index of the hue map (row 2, col 1 in the grid). */
const HUE_MAP_TILE = 3;
/** Bottom row: the R/G/B channel tiles. */
const RGB_TILES = [6, 7, 8];
/** A click that waits this long with no second click is a single click. */
const CLICK_DELAY_MS = 250;
/** How long the tint bar survives the cursor crossing the gap to reach it. */
const TINT_BAR_GRACE_MS = 300;

interface ViewGoal {
  x: number;
  y: number;
  zoom: number;
}

function fitAllZoom(size: { width: number; height: number }, aspect: number) {
  return (
    Math.min(size.width / (aspect * PLANE_H), size.height / PLANE_H) *
    FIT_MARGIN
  );
}

/** Center and size of a tile (0..8, row-major from top-left) in world units. */
function tileRect(tile: number, aspect: number) {
  const w = aspect * PLANE_H;
  const h = PLANE_H;
  const col = tile % 3;
  const row = Math.floor(tile / 3);
  return {
    cx: -w / 2 + ((col + 0.5) * w) / 3,
    cy: h / 2 - ((row + 0.5) * h) / 3,
    w: w / 3,
    h: h / 3,
  };
}

/** Tile index + intra-tile UV (v up) from a whole-plane UV. */
function tileFromUv(uv: THREE.Vector2) {
  const gx = Math.min(Math.floor(uv.x * 3), 2);
  const gyFromBottom = Math.min(Math.floor(uv.y * 3), 2);
  return {
    tile: (2 - gyFromBottom) * 3 + gx,
    u: uv.x * 3 - gx,
    v: uv.y * 3 - gyFromBottom,
  };
}

function srgbToLinear(c8: number) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Hue of an sRGB pixel, computed in the same space as the shader (linear
 * light by default, raw sRGB when the Color math setting says so); null
 * for greys. */
function pixelHue(
  data: Uint8ClampedArray,
  i: number,
  linear: boolean,
): number | null {
  const cv = (v: number) => (linear ? srgbToLinear(v) : v / 255);
  const r = cv(data[i]);
  const g = cv(data[i + 1]);
  const b = cv(data[i + 2]);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  if (diff === 0) return null;
  let h;
  if (max === r) h = (g - b) / diff;
  else if (max === g) h = 2 + (b - r) / diff;
  else h = 4 + (r - g) / diff;
  h /= 6;
  return h < 0 ? h + 1 : h;
}

type CanvasCursor = "reticle" | "grabbing" | "hidden";

function BreakdownScene({
  url,
  aspect,
  hoverTile,
  onHoverTile,
  onCursor,
}: {
  url: string;
  aspect: number;
  hoverTile: number | null;
  onHoverTile: (tile: number | null) => void;
  onCursor: (cursor: CanvasCursor) => void;
}) {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls);

  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const hueGoalRef = useRef(DEFAULT_TARGET_HUE);
  const viewGoalRef = useRef<ViewGoal | null>(null);
  const zoomedTileRef = useRef<number | null>(null);
  const rgbColorizeGoalRef = useRef(0);
  const hoverTileRef = useRef<number | null>(null);
  const hoverUvRef = useRef<{ u: number; v: number } | null>(null);
  const pinUvRef = useRef<{ u: number; v: number } | null>(null);
  const peekRef = useRef(false);
  const clickTimerRef = useRef<number | null>(null);
  const lastRgbTileRef = useRef<number | null>(null);
  const lastRgbHoverAtRef = useRef(0);
  const pinDragRef = useRef(false);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const hexCardPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const loopDownRef = useRef<{ x: number; y: number } | null>(null);
  const framedZoomRef = useRef(0);

  // Hand the DOM shell a way to request frames (tint bar handlers).
  useEffect(() => {
    canvasBridge.invalidate = invalidate;
    return () => {
      canvasBridge.invalidate = null;
    };
  }, [invalidate]);

  // Settings drive shader behavior: colorize cross-fades via the tween
  // loop, and the hover ref feeds the outline uniform each frame.
  const rgbColorize = useSettingsStore((s) => s.rgbColorize);
  useEffect(() => {
    rgbColorizeGoalRef.current = rgbColorize ? 1 : 0;
    invalidate();
  }, [rgbColorize, invalidate]);

  // Model/style/focus uniforms sync in useFrame; these subscriptions just
  // make sure a change requests the frame that applies it.
  const colorModel = useSettingsStore((s) => s.colorModel);
  const hueMapStyle = useSettingsStore((s) => s.hueMapStyle);
  const colorMath = useSettingsStore((s) => s.colorMath);
  const framedTileUi = useUiStore((s) => s.framedTile);
  const isolateUi = useUiStore((s) => s.isolate);
  useEffect(() => {
    invalidate();
  }, [colorModel, hueMapStyle, colorMath, framedTileUi, isolateUi, invalidate]);

  useEffect(() => {
    hoverTileRef.current = hoverTile;
    invalidate();
  }, [hoverTile, invalidate]);

  useEffect(
    () => () => {
      if (clickTimerRef.current !== null)
        window.clearTimeout(clickTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    new THREE.TextureLoader().load(url, (tex) => {
      if (cancelled) {
        tex.dispose();
        return;
      }
      // sRGB tag means shader samples arrive linear (the shader converts
      // back to sRGB explicitly at the end, matching the original HLSL).
      tex.colorSpace = THREE.SRGBColorSpace;
      // Nearest magnification: zoomed-in tiles show crisp source pixels.
      tex.magFilter = THREE.NearestFilter;
      setTexture(tex);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // CPU-side copy of the image so pointer moves can read the hovered
  // pixel without a GPU readback.
  useEffect(() => {
    imageDataRef.current = null;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      imageDataRef.current = ctx.getImageData(0, 0, c.width, c.height);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Request a demand-mode frame only after the textured mesh has committed;
  // invalidating from the loader callback renders before the mesh exists.
  // Also re-sync the colorize mode onto the freshly remounted material.
  useEffect(() => {
    if (!texture) return;
    const mat = materialRef.current;
    if (mat) {
      mat.uniforms.uRgbColorize.value = rgbColorizeGoalRef.current;
      mat.uniforms.uColorModel.value =
        useSettingsStore.getState().colorModel === "hsl" ? 1 : 0;
    }
    invalidate();
    return () => texture.dispose();
  }, [texture, invalidate]);

  // Fit the view when a new image arrives; reads the store imperatively so
  // a window resize never yanks a view the user has panned. Pin, framing,
  // and peek state belong to the previous image — clear them.
  useEffect(() => {
    const { camera, size, controls: ctl } = get();
    const c = ctl as {
      target?: THREE.Vector3;
      saveState?: () => void;
    } | null;
    zoomedTileRef.current = null;
    viewGoalRef.current = null;
    hueGoalRef.current = DEFAULT_TARGET_HUE;
    pinUvRef.current = null;
    peekRef.current = false;
    const ui = useUiStore.getState();
    ui.setPinnedColor(null);
    ui.setFramedTile(null);
    camera.position.set(0, 0, 5);
    c?.target?.set(0, 0, 0);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = fitAllZoom(size, aspect);
      camera.updateProjectionMatrix();
    }
    c?.saveState?.();
    invalidate();
  }, [aspect, url, get, invalidate]);

  // A user grabbing the controls takes over from any in-flight camera
  // tween, and the cursor flips to a grabbing hand for the drag.
  useEffect(() => {
    if (!controls) return;
    const ctl = controls as unknown as THREE.EventDispatcher<{
      start: object;
      end: object;
    }>;
    const onStart = () => {
      viewGoalRef.current = null;
      if (!pinDragRef.current) onCursor("grabbing");
    };
    const onEnd = () =>
      onCursor("reticle");
    ctl.addEventListener("start", onStart);
    ctl.addEventListener("end", onEnd);
    return () => {
      ctl.removeEventListener("start", onStart);
      ctl.removeEventListener("end", onEnd);
    };
  }, [controls, onCursor]);

  // Per-frame uniform sync, tween engine, and tint-bar placement. Runs
  // only while frames are requested; keeps invalidating until settled.
  useFrame((state, rawDt) => {
    let active = false;
    // Demand-mode frames can arrive after long idle gaps; an unclamped
    // delta makes every ease complete in one frame (the "inconsistent
    // tint tween"). Clamp to a 30fps step.
    const dt = Math.min(rawDt, 1 / 30);

    const mat = materialRef.current;
    if (mat) {
      mat.uniforms.uHoverTile.value = hoverTileRef.current ?? -1;
      const settings = useSettingsStore.getState();
      mat.uniforms.uHueMapStyle.value = HUE_STYLE_INDEX[settings.hueMapStyle];
      // Linear <-> sRGB cross-fade, same easing as the model swap.
      // "auto" resolves against whatever the image declares.
      const mathCur = mat.uniforms.uSrgbMath.value as number;
      const mathGoal = settings.colorMath === "srgb" ? 1 : 0;
      if (Math.abs(mathGoal - mathCur) > 0.002) {
        const k = 1 - Math.exp(-10 * dt);
        mat.uniforms.uSrgbMath.value = mathCur + (mathGoal - mathCur) * k;
        active = true;
      } else if (mathCur !== mathGoal) {
        mat.uniforms.uSrgbMath.value = mathGoal;
      }

      // HSB <-> HSL cross-fade: ease uColorModel toward the setting.
      const modelCur = mat.uniforms.uColorModel.value as number;
      const modelGoal = settings.colorModel === "hsl" ? 1 : 0;
      if (Math.abs(modelGoal - modelCur) > 0.002) {
        const k = 1 - Math.exp(-10 * dt);
        mat.uniforms.uColorModel.value = modelCur + (modelGoal - modelCur) * k;
        active = true;
      } else if (modelCur !== modelGoal) {
        mat.uniforms.uColorModel.value = modelGoal;
      }
      if (settings.hueMapStyle === "crawl") {
        // The crawl style animates: keep frames coming while selected.
        mat.uniforms.uTime.value += dt;
        active = true;
      }
      // Hue target snaps (no tween) — Taylor found the ease distracting.
      mat.uniforms.uTargetHue.value = hueGoalRef.current;

      if (state.camera instanceof THREE.OrthographicCamera) {
        const worldPerPx = 1 / state.camera.zoom;
        mat.uniforms.uUvPerPx.value.set(
          worldPerPx / ((aspect * PLANE_H) / 3),
          worldPerPx / (PLANE_H / 3),
        );
      }
      const hoverUv = hoverUvRef.current;
      mat.uniforms.uHoverUv.value.set(hoverUv?.u ?? -1, hoverUv?.v ?? -1);
      const pinUv = pinUvRef.current;
      mat.uniforms.uPinUv.value.set(pinUv?.u ?? -1, pinUv?.v ?? -1);

      const ui = useUiStore.getState();
      mat.uniforms.uIsolateTile.value =
        ui.isolate && ui.framedTile !== null ? ui.framedTile : -1;
      mat.uniforms.uPeekTile.value =
        peekRef.current && zoomedTileRef.current !== null
          ? zoomedTileRef.current
          : -1;

      // Constant-rate fade (full sweep in ~350ms) so both directions read
      // at the same speed, unlike an exponential tail.
      const mixCur = mat.uniforms.uRgbColorize.value as number;
      const mixGoal = rgbColorizeGoalRef.current;
      if (mixCur !== mixGoal) {
        const step = dt / 0.35;
        mat.uniforms.uRgbColorize.value =
          mixCur < mixGoal
            ? Math.min(mixGoal, mixCur + step)
            : Math.max(mixGoal, mixCur - step);
        active = true;
      }
    }

    const goal = viewGoalRef.current;
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
        viewGoalRef.current = null;
      }
      camera.updateProjectionMatrix();
      const ctl = state.controls as unknown as {
        target?: THREE.Vector3;
      } | null;
      ctl?.target?.set(camera.position.x, camera.position.y, 0);
      active = true;
    }

    // Zooming out well past the framed-tile zoom dissolves focus mode:
    // the title unlocks and framing state clears without moving the
    // camera. Skipped mid-tween (the tween passes through lower zooms).
    if (
      zoomedTileRef.current !== null &&
      !viewGoalRef.current &&
      state.camera instanceof THREE.OrthographicCamera &&
      state.camera.zoom < framedZoomRef.current * 0.75
    ) {
      zoomedTileRef.current = null;
      peekRef.current = false;
      useUiStore.getState().setFramedTile(null);
    }

    // Tint bar: pinned below the last hovered RGB tile, with a short grace
    // window so the cursor can cross the gap onto the bar itself.
    const bar = canvasBridge.tintBarEl;
    if (bar && state.camera instanceof THREE.OrthographicCamera) {
      const rgbHover =
        hoverTileRef.current !== null &&
        RGB_TILES.includes(hoverTileRef.current);
      if (rgbHover) {
        lastRgbTileRef.current = hoverTileRef.current;
        lastRgbHoverAtRef.current = performance.now();
      }
      const visible =
        (rgbHover ||
          canvasBridge.tintBarHover ||
          performance.now() - lastRgbHoverAtRef.current < TINT_BAR_GRACE_MS) &&
        lastRgbTileRef.current !== null;
      if (visible) {
        const r = tileRect(lastRgbTileRef.current as number, aspect);
        const cam = state.camera;
        const sx =
          (r.cx - cam.position.x) * cam.zoom + state.size.width / 2;
        const sy =
          -(r.cy - r.h / 2 - cam.position.y) * cam.zoom +
          state.size.height / 2;
        bar.style.display = "flex";
        bar.style.left = `${sx}px`;
        bar.style.top = `${Math.min(sy + 8, state.size.height - 44)}px`;
      } else {
        bar.style.display = "none";
      }
    }

    // Hexagon hover card: sits OUTSIDE the hovered tile, sliding along
    // its edge with the cursor. Prefers the side with more canvas room;
    // when no side fits (a framed tile filling the view), falls back to
    // the quadrant opposite the pointer. Loosely eased either way.
    const card = canvasBridge.hexCardEl;
    if (card) {
      const p = pointerPosRef.current;
      const tile = hoverTileRef.current;
      const wanted =
        p !== null &&
        tile !== null &&
        useSettingsStore.getState().showColorHexagon;
      if (wanted && p && state.camera instanceof THREE.OrthographicCamera) {
        const cw = card.offsetWidth || 200;
        const chh = card.offsetHeight || 200;
        const { width: sw, height: sh } = state.size;
        const cam = state.camera;
        const r = tileRect(tile as number, aspect);
        const x0 = (r.cx - r.w / 2 - cam.position.x) * cam.zoom + sw / 2;
        const x1 = (r.cx + r.w / 2 - cam.position.x) * cam.zoom + sw / 2;
        const y0 = -(r.cy + r.h / 2 - cam.position.y) * cam.zoom + sh / 2;
        const y1 = -(r.cy - r.h / 2 - cam.position.y) * cam.zoom + sh / 2;
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
        const col = (tile as number) % 3;
        if (col === 0 && fitsLeft) {
          gx = x0 - gap - cw;
          gy = clampY((y0 + y1) / 2 - chh / 2);
        } else if (col === 2 && fitsRight) {
          gx = x1 + gap;
          gy = clampY((y0 + y1) / 2 - chh / 2);
        } else if (fitsRight || fitsLeft) {
          gx =
            fitsRight && (!fitsLeft || sw - x1 >= x0)
              ? x1 + gap
              : x0 - gap - cw;
          gy = clampY((y0 + y1) / 2 - chh / 2);
        } else if (fitsBelow || fitsAbove) {
          gy =
            fitsBelow && (!fitsAbove || sh - y1 >= y0)
              ? y1 + gap
              : y0 - gap - chh;
          gx = clampX((x0 + x1) / 2 - cw / 2);
        } else {
          // Framed tile fills the view: park in the top-right corner.
          gx = sw - cw - 8;
          gy = 8;
        }
        let cur = hexCardPosRef.current;
        if (!cur) {
          cur = { x: gx, y: gy };
          hexCardPosRef.current = cur;
        }
        const k = 1 - Math.exp(-9 * dt);
        cur.x += (gx - cur.x) * k;
        cur.y += (gy - cur.y) * k;
        card.style.display = "block";
        card.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
        if (Math.hypot(gx - cur.x, gy - cur.y) > 0.5) active = true;
      } else {
        card.style.display = "none";
        hexCardPosRef.current = null;
      }
    }

    if (active) invalidate();
  });

  /** Screen-pixel distance from an intra-tile UV to the current pin. */
  const pinDistPx = (u: number, v: number) => {
    const pin = pinUvRef.current;
    const { camera } = get();
    if (!pin || !(camera instanceof THREE.OrthographicCamera))
      return Infinity;
    const pxPerU = camera.zoom * ((aspect * PLANE_H) / 3);
    const pxPerV = camera.zoom * (PLANE_H / 3);
    return Math.hypot((u - pin.u) * pxPerU, (v - pin.v) * pxPerV);
  };

  const setPinAt = (u: number, v: number) => {
    const id = imageDataRef.current;
    if (!id) return;
    const px = Math.min(Math.floor(u * id.width), id.width - 1);
    const py = Math.min(Math.floor((1 - v) * id.height), id.height - 1);
    const i = (py * id.width + px) * 4;
    pinUvRef.current = { u, v };
    useUiStore.getState().setPinnedColor({
      r: id.data[i],
      g: id.data[i + 1],
      b: id.data[i + 2],
      x: px,
      y: py,
      u,
      v,
    });
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!e.uv) return;
    pointerPosRef.current = {
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY,
    };
    const { tile, u, v } = tileFromUv(e.uv);
    // A second finger hands the gesture to the camera: abort any loop
    // drag and stop sampling until the pointers clear.
    if (canvasBridge.pointerCount > 1) {
      loopDownRef.current = null;
      if (pinDragRef.current) {
        pinDragRef.current = false;
        onCursor("reticle");
      }
      return;
    }
    // Arm the loop drag once the press travels a few pixels.
    if (loopDownRef.current && !pinDragRef.current) {
      const dx = e.nativeEvent.offsetX - loopDownRef.current.x;
      const dy = e.nativeEvent.offsetY - loopDownRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        pinDragRef.current = true;
        // Hide the cursor so the loop's contents stay visible.
        onCursor("hidden");
      }
    }
    if (pinDragRef.current) {
      setPinAt(u, v);
      invalidate();
      return;
    }
    onHoverTile(tile);
    hoverUvRef.current = { u, v };
    const mode = useSettingsStore.getState().highlightMode;
    const picking =
      mode === "all" || (mode === "tile" && tile === HUE_MAP_TILE);
    const id = imageDataRef.current;
    if (id) {
      const px = Math.min(Math.floor(u * id.width), id.width - 1);
      const py = Math.min(Math.floor((1 - v) * id.height), id.height - 1);
      const i = (py * id.width + px) * 4;
      useUiStore.getState().setHoverColor({
        r: id.data[i],
        g: id.data[i + 1],
        b: id.data[i + 2],
        x: px,
        y: py,
        u,
        v,
      });
      if (picking) {
        // Greys have no hue — hold the current target rather than jumping.
        const h = pixelHue(
          id.data,
          i,
          useSettingsStore.getState().colorMath === "linear",
        );
        if (h !== null) hueGoalRef.current = h;
      }
    }
    if (!picking) hueGoalRef.current = DEFAULT_TARGET_HUE;
    invalidate();
  };

  const onPointerOut = () => {
    onHoverTile(null);
    hoverUvRef.current = null;
    pointerPosRef.current = null;
    if (!pinDragRef.current) onCursor("reticle");
    useUiStore.getState().setHoverColor(null);
    hueGoalRef.current = DEFAULT_TARGET_HUE;
    invalidate();
    // One more frame after the grace window so the tint bar can hide.
    window.setTimeout(() => invalidate(), TINT_BAR_GRACE_MS + 50);
  };

  // Any primary-button (or one-finger) drag moves the selection loop —
  // the canvas itself pans with RMB / two fingers instead.
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !e.uv) return;
    if (canvasBridge.pointerCount > 1) return;
    loopDownRef.current = {
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY,
    };
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
  };

  const onPointerUp = () => {
    loopDownRef.current = null;
    if (!pinDragRef.current) return;
    pinDragRef.current = false;
    onCursor("reticle");
    invalidate();
  };

  const frameTile = useCallback(
    (tile: number, snap = false) => {
      const { size, camera, controls } = get();
      zoomedTileRef.current = tile;
      useUiStore.getState().setFramedTile(tile);
      const r = tileRect(tile, aspect);
      const zoom =
        Math.min(size.width / r.w, size.height / r.h) * FRAME_MARGIN;
      framedZoomRef.current = zoom;
      if (snap && camera instanceof THREE.OrthographicCamera) {
        viewGoalRef.current = null;
        camera.position.set(r.cx, r.cy, camera.position.z);
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
        (controls as { target?: THREE.Vector3 } | null)?.target?.set(
          r.cx,
          r.cy,
          0,
        );
      } else {
        viewGoalRef.current = { x: r.cx, y: r.cy, zoom };
      }
      invalidate();
    },
    [aspect, get, invalidate],
  );

  const unframe = useCallback(
    (snap = false) => {
      zoomedTileRef.current = null;
      peekRef.current = false;
      useUiStore.getState().setFramedTile(null);
      const { size, camera, controls } = get();
      const zoom = fitAllZoom(size, aspect);
      if (snap && camera instanceof THREE.OrthographicCamera) {
        viewGoalRef.current = null;
        camera.position.set(0, 0, camera.position.z);
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
        (controls as { target?: THREE.Vector3 } | null)?.target?.set(0, 0, 0);
      } else {
        viewGoalRef.current = { x: 0, y: 0, zoom };
      }
      invalidate();
    },
    [aspect, get, invalidate],
  );

  useEffect(() => {
    canvasBridge.refit = () => unframe();
    return () => {
      canvasBridge.refit = null;
    };
  }, [unframe]);

  // Single click pins (or unpins) the color sample. Held briefly so a
  // double-click (framing) doesn't also move the pin.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // Ignore drag-release "clicks" (delta = px between down and up) and
    // the trailing click of a multi-finger gesture.
    if (!e.uv || e.delta > 4 || canvasBridge.multiTouch) return;
    const { tile, u, v } = tileFromUv(e.uv);

    // Touch double-tap = frame the tile: the canvas has touch-action
    // none, so the browser never synthesizes dblclick for taps.
    if ((e.nativeEvent as PointerEvent).pointerType === "touch") {
      const now = performance.now();
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;
      const last = lastTapRef.current;
      lastTapRef.current = { t: now, x, y };
      if (
        last &&
        now - last.t < 320 &&
        Math.hypot(x - last.x, y - last.y) < 32
      ) {
        lastTapRef.current = null;
        if (clickTimerRef.current !== null) {
          window.clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
        canvasBridge.meshDblAt = now;
        if (zoomedTileRef.current === tile) unframe();
        else frameTile(tile);
        return;
      }
    }

    if (clickTimerRef.current !== null)
      window.clearTimeout(clickTimerRef.current);
    // Touch pins wait out the double-tap window; mouse only the dblclick.
    const pinDelay =
      (e.nativeEvent as PointerEvent).pointerType === "touch"
        ? 340
        : CLICK_DELAY_MS;
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      if (pinDistPx(u, v) < 12) {
        // Clicking on (or near) the existing pin clears it.
        pinUvRef.current = null;
        useUiStore.getState().setPinnedColor(null);
      } else {
        setPinAt(u, v);
      }
      invalidate();
    }, pinDelay);
  };

  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    canvasBridge.meshDblAt = performance.now();
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    if (!e.uv) return;
    const { tile } = tileFromUv(e.uv);
    if (zoomedTileRef.current === tile) unframe();
    else frameTile(tile);
  };

  // Keyboard: arrows navigate tiles while framed (left/right wrap through
  // the reading order, up/down clamp), Escape unframes or clears the pin,
  // and holding Space peeks at the source over the framed tile.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Leave keys alone when a form control (e.g. the settings sheet) has
      // focus.
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName))
      )
        return;

      if (e.key === "Escape") {
        if (zoomedTileRef.current !== null) {
          unframe();
        } else if (pinUvRef.current) {
          pinUvRef.current = null;
          useUiStore.getState().setPinnedColor(null);
          invalidate();
        }
        return;
      }

      if (zoomedTileRef.current === null) return;

      if (e.key === " ") {
        e.preventDefault();
        if (!peekRef.current) {
          peekRef.current = true;
          invalidate();
        }
        return;
      }

      const cur = zoomedTileRef.current;
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
      if (e.key === " " && peekRef.current) {
        peekRef.current = false;
        invalidate();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [frameTile, unframe, invalidate]);

  // One stable uniforms object per texture. An inline object literal here
  // is a NEW identity every render, so any re-render (e.g. hover state)
  // made R3F re-apply the prop and reset every uniform to its initial
  // value — uRgbColorize snapped to 0 and faded back up, which read as a
  // flicker on the RGB tiles whenever the cursor crossed tiles.
  const uniforms = useMemo(
    () =>
      texture
        ? {
            uSource: { value: texture },
            uTargetHue: { value: DEFAULT_TARGET_HUE },
            uRgbColorize: { value: 0 },
            uHoverTile: { value: -1 },
            uUvPerPx: { value: new THREE.Vector2() },
            uPinUv: { value: new THREE.Vector2(-1, -1) },
            uHoverUv: { value: new THREE.Vector2(-1, -1) },
            uIsolateTile: { value: -1 },
            uPeekTile: { value: -1 },
            uColorModel: { value: 0 },
            uHueMapStyle: { value: 0 },
            uTime: { value: 0 },
            uSrgbMath: { value: 0 },
          }
        : null,
    [texture],
  );

  if (!texture || !uniforms) return null;

  return (
    <mesh
      scale={[aspect * PLANE_H, PLANE_H, 1]}
      frustumCulled={false}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <planeGeometry args={[1, 1]} />
      {/* Remount the material per texture so the uniform stays in sync. */}
      <shaderMaterial
        key={texture.uuid}
        ref={materialRef}
        vertexShader={breakdownVertexShader}
        fragmentShader={breakdownFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

// Tiles 1 and 2 both push saturation to full; what separates them is
// whether brightness survives — shaded keeps it, flat discards it. The
// old "mid/max saturation" names described a difference that isn't there.
const TILE_NAMES = [
  "Source",
  "Hue · shaded",
  "Hue · flat",
  "Hue map",
  "Saturation",
  "Brightness",
  "Red",
  "Green",
  "Blue",
];

// Crosshair with a wide center gap so the focused area stays visible
// while hue-picking; white over a black halo so it reads on any color.
// 32px canvas, ticks 2..9 / 23..30 leave a 14px clear window at center.
const RETICLE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g fill='none' stroke-linecap='round'><g stroke='black' stroke-width='4'><path d='M16 2v7M16 23v7M2 16h7M23 16h7'/></g><g stroke='white' stroke-width='2'><path d='M16 2v7M16 23v7M2 16h7M23 16h7'/></g></g></svg>`;
const RETICLE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(RETICLE_SVG)}") 16 16, crosshair`;

/**
 * The 3x3 breakdown grid on a pan/zoom canvas: drag to pan, wheel to zoom
 * toward the cursor, single-click to pin a sample, double-click a tile to
 * frame it (again, Escape, or double-click outside to return; arrows
 * navigate; Space peeks at the source; the mask button isolates). The
 * plane keeps the source image's aspect ratio.
 */
export function BreakdownCanvas() {
  const url = useSourceStore((s) => s.url);
  const width = useSourceStore((s) => s.width);
  const height = useSourceStore((s) => s.height);
  const rgbColorize = useSettingsStore((s) => s.rgbColorize);
  const setRgbColorize = useSettingsStore((s) => s.setRgbColorize);
  const framedTile = useUiStore((s) => s.framedTile);
  const isolate = useUiStore((s) => s.isolate);
  const setIsolate = useUiStore((s) => s.setIsolate);
  const setCanvasEl = useUiStore((s) => s.setCanvasEl);
  const showColorHexagon = useSettingsStore((s) => s.showColorHexagon);
  const [hoverTile, setHoverTile] = useState<number | null>(null);
  const [cursor, setCursor] = useState<CanvasCursor>("reticle");

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-base text-muted-foreground">Loading image…</p>
      </div>
    );
  }

  // While a tile is framed its name stays locked in the title; hover
  // names only show in the zoomed-out grid view.
  const labelTile = framedTile ?? hoverTile;

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-md border border-border"
      style={{
        cursor:
          cursor === "hidden"
            ? "none"
            : cursor === "grabbing"
              ? "grabbing"
              : RETICLE_CURSOR,
      }}
      onContextMenu={(e) => e.preventDefault()}
      // Capture-phase pointer census: a second finger means the gesture
      // belongs to the camera (two-finger pan/pinch), never the pin.
      onPointerDownCapture={() => {
        canvasBridge.pointerCount += 1;
        if (canvasBridge.pointerCount > 1) canvasBridge.multiTouch = true;
      }}
      onPointerUpCapture={() => {
        canvasBridge.pointerCount = Math.max(0, canvasBridge.pointerCount - 1);
        if (canvasBridge.pointerCount === 0)
          // Cleared on a delay so the trailing click still sees the flag.
          window.setTimeout(() => {
            canvasBridge.multiTouch = false;
          }, 120);
      }}
      onPointerCancelCapture={() => {
        canvasBridge.pointerCount = Math.max(0, canvasBridge.pointerCount - 1);
        if (canvasBridge.pointerCount === 0)
          window.setTimeout(() => {
            canvasBridge.multiTouch = false;
          }, 120);
      }}
      onDoubleClick={() => {
        // A double-click the mesh already handled arrives here ~instantly
        // after; anything else was outside the tiles — recenter the view.
        if (performance.now() - canvasBridge.meshDblAt < 100) return;
        canvasBridge.refit?.();
      }}
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 5], zoom: 300, near: 0.1, far: 10 }}
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: false, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => setCanvasEl(gl.domElement)}
      >
        <BreakdownScene
          url={url}
          aspect={width / height}
          hoverTile={hoverTile}
          onHoverTile={(t) => {
            setHoverTile(t);
            // Mirrored into the UI store for the hexagon's twilight ring.
            useUiStore.getState().setHoverTile(t);
          }}
          onCursor={setCursor}
        />
        <MapControls
          makeDefault
          enableRotate={false}
          screenSpacePanning
          zoomToCursor
          enableDamping={false}
          minZoom={40}
          maxZoom={20000}
          // Touch: one finger stays free for color sampling (pointer
          // events reach the mesh); two fingers pan and pinch-zoom.
          touches={{
            ONE: -1 as unknown as THREE.TOUCH,
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
          // Mouse: RIGHT drags the canvas; LEFT is freed to move the
          // selection loop (context menu is suppressed on the wrapper).
          mouseButtons={{
            LEFT: -1 as unknown as THREE.MOUSE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
      </Canvas>

      {/* Tile title widget: hover name, or the framed tile's name in focus
          mode, with the isolate (mask) toggle beside it. */}
      <div
        className={cn(
          "absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-popover/90 px-3 py-1 font-mono text-base shadow-[var(--shadow-md)] transition-opacity duration-150",
          labelTile === null ? "opacity-0" : "opacity-100",
          framedTile === null ? "pointer-events-none" : "pointer-events-auto",
        )}
        aria-live="polite"
      >
        <span>{labelTile !== null ? TILE_NAMES[labelTile] : " "}</span>
        {framedTile !== null && (
          <button
            type="button"
            aria-pressed={isolate}
            title={isolate ? "Show all tiles" : "Show only this tile"}
            className={cn(
              "cursor-pointer rounded-sm p-0.5 transition-colors",
              isolate
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setIsolate(!isolate);
              canvasBridge.invalidate?.();
            }}
          >
            <Focus className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Hexagon hover card: positioned per-frame by the scene. */}
      {showColorHexagon && (
        <div
          ref={(el) => {
            canvasBridge.hexCardEl = el;
          }}
          style={{ display: "none" }}
          className="pointer-events-none absolute left-0 top-0 z-20 rounded-lg border border-border bg-popover/95 p-1.5 shadow-[var(--shadow-lg)]"
        >
          <HexagonInner />
        </div>
      )}

      {/* Tint bar: positioned below the hovered RGB tile by the scene. */}
      <div
        ref={(el) => {
          canvasBridge.tintBarEl = el;
        }}
        style={{ display: "none" }}
        className="absolute z-10 -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-popover/95 px-2.5 py-1 font-mono text-base shadow-[var(--shadow-md)]"
        onMouseEnter={() => {
          canvasBridge.tintBarHover = true;
        }}
        onMouseLeave={() => {
          canvasBridge.tintBarHover = false;
          window.setTimeout(() => canvasBridge.invalidate?.(), 50);
        }}
      >
        <span className="text-muted-foreground">Tint</span>
        {(
          [
            [false, "White"],
            [true, "Color"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={rgbColorize === value}
            className={cn(
              "cursor-pointer rounded-sm px-1.5 transition-colors",
              rgbColorize === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setRgbColorize(value);
              canvasBridge.invalidate?.();
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
