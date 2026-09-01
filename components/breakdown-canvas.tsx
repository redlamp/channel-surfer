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
import { pixelHue } from "@/lib/color";
import { useSourceStore } from "@/stores/source-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  TILE_TRANSFORMS,
  hueMapTileIndex,
  tintGroupOfTile,
  type TileLayout,
  type TintGroup,
} from "@/lib/tile-transforms";

import {
  TileEffectMenu,
  type TileMenuState,
} from "@/components/tile-effect-menu";
import { canvasBridge, useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

/** Which context bar the effect at a grid position gets: a Tint bar
 * (RGB channels or chroma), the warm/cool Shade bar, or none. */
type BarGroup = TintGroup | "warmcool";
function barGroupOfTile(layout: TileLayout, tile: number): BarGroup | null {
  if (layout[tile] === "warmCool") return "warmcool";
  return tintGroupOfTile(layout, tile);
}

const HUE_STYLE_INDEX = {
  warmcool: 0,
  glow: 1,
  twilight: 2,
  diamond: 3,
  crawl: 4,
} as const;


/** World-space height of the 3x3 grid plane; width is aspect x this. */
/** Right-button travel (px) still counted as a click, not a pan. */
const RMB_SLOP = 4;

const PLANE_H = 1;
const FIT_MARGIN = 0.94;
/** Framed-tile margin: slivers of the neighbors stay visible so they can
 * be double-clicked directly. */
const FRAME_MARGIN = 0.88;
/** Resting hue-map target: 180 degrees. */
const DEFAULT_TARGET_HUE = 0.5;
/** Tile index of the hue map (row 2, col 1 in the grid). */
/** Bottom row: the R/G/B channel tiles. */
/** A click that waits this long with no second click is a single click. */
const CLICK_DELAY_MS = 250;
/** How long the tint bar survives the cursor crossing the gap to reach it. */
const TINT_BAR_GRACE_MS = 300;

interface ViewGoal {
  x: number;
  y: number;
  zoom: number;
}

/** Overlay chrome the fit should avoid (header, open panel). */
type ViewInsets = { top: number; right: number };

function fitAllZoom(
  size: { width: number; height: number },
  aspect: number,
  insets: ViewInsets,
) {
  return (
    Math.min(
      (size.width - insets.right) / (aspect * PLANE_H),
      (size.height - insets.top) / PLANE_H,
    ) * FIT_MARGIN
  );
}

/** Camera position that centers world point (cx, cy) in the region the
 * chrome leaves clear. Screen +y is down and world +y is up, so both
 * offsets ADD: the camera looks above-right of the content, pushing it
 * down-left on screen, out from under the header and panel. */
function insetCenter(cx: number, cy: number, zoom: number, insets: ViewInsets) {
  return {
    x: cx + insets.right / (2 * zoom),
    y: cy + insets.top / (2 * zoom),
  };
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

type CanvasCursor = "reticle" | "grabbing" | "hidden";

function BreakdownScene({
  blob,
  hoverTile,
  onHoverTile,
  onCursor,
  onDecoding,
}: {
  blob: Blob;
  hoverTile: number | null;
  onHoverTile: (tile: number | null) => void;
  onCursor: (cursor: CanvasCursor) => void;
  onDecoding: (busy: boolean) => void;
}) {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls);

  // The committed image: texture and aspect swap in together once a
  // decode lands, so the previous image (right aspect, live readouts)
  // stays up for the whole decode instead of a blank or stretched canvas.
  const [view, setView] = useState<{
    texture: THREE.Texture;
    aspect: number;
  } | null>(null);
  const texture = view?.texture ?? null;
  const aspect = view?.aspect ?? 1;

  const materialRef = useRef<THREE.ShaderMaterial>(null);
  // 2D context over the decoded image for on-demand 1x1 pixel readouts —
  // NOT a full ImageData copy, which at 30MP would be a ~120MB
  // main-thread stall for data the readouts touch one pixel at a time.
  const readCtxRef = useRef<{
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
  } | null>(null);
  const hueGoalRef = useRef(DEFAULT_TARGET_HUE);
  const viewGoalRef = useRef<ViewGoal | null>(null);
  const zoomedTileRef = useRef<number | null>(null);
  const rgbColorizeGoalRef = useRef(0);
  const chromaColorizeGoalRef = useRef(0);
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
  const chromaColorize = useSettingsStore((s) => s.chromaColorize);
  useEffect(() => {
    rgbColorizeGoalRef.current = rgbColorize ? 1 : 0;
    chromaColorizeGoalRef.current = chromaColorize ? 1 : 0;
    invalidate();
  }, [rgbColorize, chromaColorize, invalidate]);

  // Model/style/focus uniforms sync in useFrame; these subscriptions just
  // make sure a change requests the frame that applies it.
  const colorModel = useSettingsStore((s) => s.colorModel);
  const hueMapStyle = useSettingsStore((s) => s.hueMapStyle);
  const tileLayout = useSettingsStore((s) => s.tileLayout);
  const midLevel = useSettingsStore((s) => s.midLevel);
  const neutralTolerance = useSettingsStore((s) => s.neutralTolerance);
  const colorMath = useSettingsStore((s) => s.colorMath);
  const chromaSmooth = useSettingsStore((s) => s.chromaSmooth);
  const warmCoolShade = useSettingsStore((s) => s.warmCoolShade);
  const framedTileUi = useUiStore((s) => s.framedTile);
  const isolateUi = useUiStore((s) => s.isolate);
  useEffect(() => {
    invalidate();
  }, [
    colorModel,
    hueMapStyle,
    tileLayout,
    midLevel,
    neutralTolerance,
    colorMath,
    chromaSmooth,
    warmCoolShade,
    framedTileUi,
    isolateUi,
    invalidate,
  ]);

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

  // One decode per image, shared by the texture and the pixel readouts.
  // createImageBitmap decodes off the main thread; the bitmap is drawn
  // onto one 2D canvas that serves BOTH as the GPU upload source and as
  // the 1x1 readout surface. (The old path decoded twice — TextureLoader
  // plus a hidden <img> — and copied the full frame out with
  // getImageData, which is what made big images take tens of seconds.)
  useEffect(() => {
    let cancelled = false;
    onDecoding(true);
    (async () => {
      const bmp = await createImageBitmap(blob);
      if (cancelled) {
        bmp.close();
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(bmp, 0, 0);

      // A source over the GPU's texture cap uploads downscaled (readouts
      // keep the full-res canvas) — otherwise the upload silently fails
      // on small-cap (typically mobile) GPUs.
      const maxSize = get().gl.capabilities.maxTextureSize ?? 4096;
      let texSource: HTMLCanvasElement = canvas;
      if (Math.max(bmp.width, bmp.height) > maxSize) {
        const scale = maxSize / Math.max(bmp.width, bmp.height);
        const scaled = document.createElement("canvas");
        scaled.width = Math.max(1, Math.round(bmp.width * scale));
        scaled.height = Math.max(1, Math.round(bmp.height * scale));
        scaled
          .getContext("2d")
          ?.drawImage(bmp, 0, 0, scaled.width, scaled.height);
        texSource = scaled;
      }
      const nextAspect = bmp.width / bmp.height;
      bmp.close();

      const tex = new THREE.CanvasTexture(texSource);
      // sRGB tag means shader samples arrive linear (the shader converts
      // back to sRGB explicitly at the end, matching the original HLSL).
      tex.colorSpace = THREE.SRGBColorSpace;
      // Nearest magnification: zoomed-in tiles show crisp source pixels.
      tex.magFilter = THREE.NearestFilter;
      // Readouts and texture swap in the same commit so what the cursor
      // samples always matches what the tiles show.
      readCtxRef.current = { ctx, width: canvas.width, height: canvas.height };
      setView({ texture: tex, aspect: nextAspect });
      onDecoding(false);
    })().catch((err) => {
      console.error("Image decode failed", err);
      if (!cancelled) onDecoding(false);
    });
    return () => {
      cancelled = true;
    };
  }, [blob, get, onDecoding]);

  // Request a demand-mode frame only after the textured mesh has committed;
  // invalidating from the loader callback renders before the mesh exists.
  // Also re-sync the colorize mode onto the freshly remounted material.
  useEffect(() => {
    if (!texture) return;
    const mat = materialRef.current;
    if (mat) {
      mat.uniforms.uRgbColorize.value = rgbColorizeGoalRef.current;
      mat.uniforms.uChromaColorize.value = chromaColorizeGoalRef.current;
      mat.uniforms.uColorModel.value =
        useSettingsStore.getState().colorModel === "hsl" ? 1 : 0;
    }
    invalidate();
    return () => texture.dispose();
  }, [texture, invalidate]);

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
      mat.uniforms.uMidLevel.value = settings.midLevel;
      mat.uniforms.uNeutralTol.value = settings.neutralTolerance;
      const slots = mat.uniforms.uTileTransform.value as number[];
      for (let i = 0; i < slots.length; i++) {
        slots[i] = TILE_TRANSFORMS[settings.tileLayout[i]].id;
      }
      // Linear <-> sRGB cross-fade, same easing as the model swap.
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
      mat.uniforms.uPinnedTile.value = ui.pinnedTile ?? -1;
      mat.uniforms.uIsolateTile.value =
        ui.isolate && ui.framedTile !== null ? ui.framedTile : -1;
      mat.uniforms.uPeekTile.value =
        peekRef.current && zoomedTileRef.current !== null
          ? zoomedTileRef.current
          : -1;

      // Constant-rate fade (full sweep in ~350ms) so both directions read
      // at the same speed, unlike an exponential tail.
      const step = dt / 0.35;
      const fade = (name: string, goal: number) => {
        const cur = mat.uniforms[name].value as number;
        if (cur === goal) return false;
        mat.uniforms[name].value =
          cur < goal ? Math.min(goal, cur + step) : Math.max(goal, cur - step);
        return true;
      };
      if (fade("uRgbColorize", rgbColorizeGoalRef.current)) active = true;
      if (fade("uChromaColorize", chromaColorizeGoalRef.current))
        active = true;
      if (fade("uChromaSmooth", settings.chromaSmooth ? 1 : 0)) active = true;
      if (fade("uWarmCoolShade", settings.warmCoolShade ? 1 : 0))
        active = true;
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

    // Context bar (Tint or warm/cool Shade): pinned below the last
    // hovered bar-carrying tile, with a short grace
    // window so the cursor can cross the gap onto the bar itself.
    const bar = canvasBridge.tintBarEl;
    if (bar && state.camera instanceof THREE.OrthographicCamera) {
      const rgbHover =
        hoverTileRef.current !== null &&
        barGroupOfTile(
          useSettingsStore.getState().tileLayout,
          hoverTileRef.current,
        ) !== null;
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

  /** The decoded pixel under an intra-tile UV, read on demand (1x1). */
  const readPixel = (u: number, v: number) => {
    const rc = readCtxRef.current;
    if (!rc) return null;
    const px = Math.min(Math.floor(u * rc.width), rc.width - 1);
    const py = Math.min(Math.floor((1 - v) * rc.height), rc.height - 1);
    const d = rc.ctx.getImageData(px, py, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], x: px, y: py };
  };

  const setPinAt = (tile: number, u: number, v: number) => {
    const px = readPixel(u, v);
    if (!px) return;
    pinUvRef.current = { u, v };
    const ui = useUiStore.getState();
    ui.setPinnedColor({ ...px, u, v });
    // Pinning also selects the tile: white outline, and the inspector
    // falls back to it when nothing is hovered.
    ui.setPinnedTile(tile);
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
      setPinAt(tile, u, v);
      invalidate();
      return;
    }
    onHoverTile(tile);
    hoverUvRef.current = { u, v };
    const mode = useSettingsStore.getState().highlightMode;
    const picking =
      mode === "all" ||
      (mode === "tile" &&
        tile === hueMapTileIndex(useSettingsStore.getState().tileLayout));
    const px = readPixel(u, v);
    if (px) {
      useUiStore.getState().setHoverColor({ ...px, u, v });
      if (picking) {
        // Greys have no hue — hold the current target rather than jumping.
        const h = pixelHue(
          px.r,
          px.g,
          px.b,
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
      const insets = useUiStore.getState().viewInsets;
      zoomedTileRef.current = tile;
      useUiStore.getState().setFramedTile(tile);
      const r = tileRect(tile, aspect);
      const zoom =
        Math.min(
          (size.width - insets.right) / r.w,
          (size.height - insets.top) / r.h,
        ) * FRAME_MARGIN;
      framedZoomRef.current = zoom;
      const c = insetCenter(r.cx, r.cy, zoom, insets);
      if (snap && camera instanceof THREE.OrthographicCamera) {
        viewGoalRef.current = null;
        camera.position.set(c.x, c.y, camera.position.z);
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
        (controls as { target?: THREE.Vector3 } | null)?.target?.set(
          c.x,
          c.y,
          0,
        );
      } else {
        viewGoalRef.current = { x: c.x, y: c.y, zoom };
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
      const insets = useUiStore.getState().viewInsets;
      const zoom = fitAllZoom(size, aspect, insets);
      const c = insetCenter(0, 0, zoom, insets);
      if (snap && camera instanceof THREE.OrthographicCamera) {
        viewGoalRef.current = null;
        camera.position.set(c.x, c.y, camera.position.z);
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
        (controls as { target?: THREE.Vector3 } | null)?.target?.set(
          c.x,
          c.y,
          0,
        );
      } else {
        viewGoalRef.current = { x: c.x, y: c.y, zoom };
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

  // Where the grid sits on the canvas right now, in device px — PNG
  // export crops to this instead of shipping the letterbox flanks and
  // the dead space under the header/panel.
  useEffect(() => {
    canvasBridge.gridScreenRect = () => {
      const { camera, size, gl } = get();
      if (!(camera instanceof THREE.OrthographicCamera)) return null;
      const dpr = gl.getPixelRatio();
      const w = aspect * PLANE_H;
      const h = PLANE_H;
      const left = ((-w / 2 - camera.position.x) * camera.zoom + size.width / 2) * dpr;
      const top = ((camera.position.y - h / 2) * camera.zoom + size.height / 2) * dpr;
      const width = w * camera.zoom * dpr;
      const height = h * camera.zoom * dpr;
      // Intersect with the canvas; zoomed in, only the visible part
      // can be exported.
      const x0 = Math.max(left, 0);
      const y0 = Math.max(top, 0);
      const x1 = Math.min(left + width, size.width * dpr);
      const y1 = Math.min(top + height, size.height * dpr);
      if (x1 - x0 < 1 || y1 - y0 < 1) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    return () => {
      canvasBridge.gridScreenRect = null;
    };
  }, [aspect, get]);

  // Fit the view when a new image arrives; reads the store imperatively
  // so a window resize never yanks a view the user has panned. Pin and
  // peek state belong to the previous image — clear them. A FRAMED tile
  // survives the swap: the camera re-frames the same grid position
  // against the new image's aspect instead of resetting to the full
  // grid. (Declared below frameTile/unframe — referencing them from an
  // earlier hook is a TDZ error.)
  useEffect(() => {
    const { camera, size, controls: ctl } = get();
    const c = ctl as {
      target?: THREE.Vector3;
      saveState?: () => void;
    } | null;
    viewGoalRef.current = null;
    hueGoalRef.current = DEFAULT_TARGET_HUE;
    pinUvRef.current = null;
    peekRef.current = false;
    const ui = useUiStore.getState();
    ui.setPinnedColor(null);
    ui.setPinnedTile(null);
    const framed = zoomedTileRef.current;
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
  }, [view, get, invalidate, frameTile]);

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
        useUiStore.getState().setPinnedTile(null);
      } else {
        setPinAt(tile, u, v);
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
          useUiStore.getState().setPinnedTile(null);
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
  const uniforms = useMemo(() => {
    if (!texture) return null;
    // Seed every CPU-eased uniform AT its current goal. A fresh material
    // (new image, hot reload) otherwise starts each at 0 and eases in,
    // which reads as a whole-grid flash — most visibly a gamma sweep
    // that crawls the saturation tile's shadow boundaries.
    const s = useSettingsStore.getState();
    return {
            uSource: { value: texture },
            // One source texel in tile-UV units, for the chroma-smoothing
            // neighborhood taps.
            uTexelSize: {
              value: new THREE.Vector2(
                1 / (texture.image as HTMLCanvasElement).width,
                1 / (texture.image as HTMLCanvasElement).height,
              ),
            },
            uChromaSmooth: { value: s.chromaSmooth ? 1 : 0 },
            uWarmCoolShade: { value: s.warmCoolShade ? 1 : 0 },
            uTargetHue: { value: DEFAULT_TARGET_HUE },
            uRgbColorize: { value: s.rgbColorize ? 1 : 0 },
            uChromaColorize: { value: s.chromaColorize ? 1 : 0 },
            uHoverTile: { value: -1 },
            uPinnedTile: { value: -1 },
            uUvPerPx: { value: new THREE.Vector2() },
            uPinUv: { value: new THREE.Vector2(-1, -1) },
            uHoverUv: { value: new THREE.Vector2(-1, -1) },
            uIsolateTile: { value: -1 },
            uPeekTile: { value: -1 },
            uColorModel: { value: s.colorModel === "hsl" ? 1 : 0 },
            uHueMapStyle: { value: 0 },
            uMidLevel: { value: s.midLevel },
            uNeutralTol: { value: s.neutralTolerance },
            uTileTransform: {
              value: s.tileLayout.map((k) => TILE_TRANSFORMS[k].id),
            },
            uTime: { value: 0 },
            uSrgbMath: { value: s.colorMath === "srgb" ? 1 : 0 },
          };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goal seed only
  }, [texture]);

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
  const blob = useSourceStore((s) => s.blob);
  const rgbColorize = useSettingsStore((s) => s.rgbColorize);
  const setRgbColorize = useSettingsStore((s) => s.setRgbColorize);
  const chromaColorize = useSettingsStore((s) => s.chromaColorize);
  const setChromaColorize = useSettingsStore((s) => s.setChromaColorize);
  const framedTile = useUiStore((s) => s.framedTile);
  const isolate = useUiStore((s) => s.isolate);
  const setIsolate = useUiStore((s) => s.setIsolate);
  const setCanvasEl = useUiStore((s) => s.setCanvasEl);
  const showColorHexagon = useSettingsStore((s) => s.showColorHexagon);
  const tileLayout = useSettingsStore((s) => s.tileLayout);
  const setTileTransform = useSettingsStore((s) => s.setTileTransform);
  const [hoverTile, setHoverTile] = useState<number | null>(null);
  const [tileMenu, setTileMenu] = useState<TileMenuState | null>(null);
  // Right-button press origin. A release within RMB_SLOP of it is a
  // click (open the effect menu); anything further was a camera pan, so
  // the menu stays shut and MapControls keeps the gesture.
  const rmbDownRef = useRef<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<CanvasCursor>("reticle");
  // The bar drives the control belonging to the tile it is anchored under,
  // and chroma toggles independently of the RGB channels. Latched, not read
  // from hoverTile: moving the cursor off the tile and onto the bar clears
  // the hover, which would otherwise fall back to the RGB control and
  // toggle the wrong thing.
  const [barGroup, setBarGroup] = useState<BarGroup | null>(null);
  const barOn = barGroup === "chroma" ? chromaColorize : rgbColorize;
  const setBarOn =
    barGroup === "chroma" ? setChromaColorize : setRgbColorize;
  const warmCoolShade = useSettingsStore((s) => s.warmCoolShade);
  const setWarmCoolShade = useSettingsStore((s) => s.setWarmCoolShade);
  // True while a newly selected image is decoding; the previous image
  // stays up underneath, so this just badges the wait.
  const [decoding, setDecoding] = useState(false);
  const loadError = useSourceStore((s) => s.error);

  if (!blob) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-base text-muted-foreground">
          {loadError ? "Drop an image to get started" : "Loading image…"}
        </p>
      </div>
    );
  }

  // While a tile is framed its name stays locked in the title; hover
  // names only show in the zoomed-out grid view.
  const labelTile = framedTile ?? hoverTile;
  const tileName =
    labelTile === null ? " " : TILE_TRANSFORMS[tileLayout[labelTile]].name;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
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
      onPointerDownCapture={(e) => {
        canvasBridge.pointerCount += 1;
        if (canvasBridge.pointerCount > 1) canvasBridge.multiTouch = true;
        if (e.button === 2)
          rmbDownRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUpCapture={(e) => {
        if (e.button === 2) {
          const down = rmbDownRef.current;
          rmbDownRef.current = null;
          const moved =
            !down ||
            Math.hypot(e.clientX - down.x, e.clientY - down.y) > RMB_SLOP;
          if (!moved && hoverTile !== null) {
            const r = e.currentTarget.getBoundingClientRect();
            setTileMenu({
              x: e.clientX - r.left,
              y: e.clientY - r.top,
              tile: hoverTile,
              current: tileLayout[hoverTile],
            });
          }
        }
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
      {/* Decode badge: the old image stays interactive underneath. */}
      {decoding && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="animate-pulse rounded-md border border-border bg-popover/90 px-3 py-1.5 font-mono text-base shadow-[var(--shadow-md)]">
            Decoding image…
          </p>
        </div>
      )}

      {tileMenu && (
        <TileEffectMenu
          state={tileMenu}
          onPick={setTileTransform}
          onClose={() => setTileMenu(null)}
        />
      )}
      <Canvas
        orthographic
        camera={{ position: [0, 0, 5], zoom: 300, near: 0.1, far: 10 }}
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: false, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => setCanvasEl(gl.domElement)}
      >
        <BreakdownScene
          blob={blob}
          hoverTile={hoverTile}
          onHoverTile={(t) => {
            setHoverTile(t);
            // Mirrored into the UI store for the hexagon's twilight ring.
            useUiStore.getState().setHoverTile(t);
            if (t !== null) {
              const g = barGroupOfTile(
                useSettingsStore.getState().tileLayout,
                t,
              );
              if (g !== null) setBarGroup(g);
            }
          }}
          onCursor={setCursor}
          onDecoding={setDecoding}
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
          "absolute left-1/2 top-14 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-popover/90 px-3 py-1 font-mono text-base shadow-[var(--shadow-md)] transition-opacity duration-150",
          labelTile === null ? "opacity-0" : "opacity-100",
          framedTile === null ? "pointer-events-none" : "pointer-events-auto",
        )}
        aria-live="polite"
      >
        <span>{tileName}</span>
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

      {/* Context bar (Tint or warm/cool Shade), positioned below the
          hovered tile by the scene. */}
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
        <span className="text-muted-foreground">
          {barGroup === "warmcool" ? "Shade" : "Tint"}
        </span>
        {barGroup === "warmcool"
          ? (
              [
                [false, "Flat"],
                [true, "Shaded"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={warmCoolShade === value}
                className={cn(
                  "cursor-pointer rounded-sm px-1.5 transition-colors",
                  warmCoolShade === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setWarmCoolShade(value);
                  canvasBridge.invalidate?.();
                }}
              >
                {label}
              </button>
            ))
          : (
              [
                [false, "White"],
                [true, "Color"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={barOn === value}
                className={cn(
                  "cursor-pointer rounded-sm px-1.5 transition-colors",
                  barOn === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setBarOn(value);
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
