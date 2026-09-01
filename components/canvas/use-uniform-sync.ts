"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { TILE_TRANSFORMS } from "@/lib/tile-transforms";
import { useSettingsStore } from "@/stores/settings-store";
import { canvasBridge, useUiStore } from "@/stores/ui-store";
import { DEFAULT_TARGET_HUE, HUE_STYLE_INDEX, PLANE_H } from "./geometry";
import type { SceneRef } from "./scene-state";

/**
 * Owns the shader material's uniforms: the stable uniforms object per
 * texture, the CPU-side tweens (tint fades, model and gamma cross-fades,
 * the crawl clock), and the per-frame copy of hover/pin/focus state.
 *
 * Owns `hoverTile`, `rgbColorizeGoal`, `chromaColorizeGoal` in SceneState.
 */
export function useUniformSync(
  sceneRef: SceneRef,
  texture: THREE.Texture | null,
  aspect: number,
  hoverTile: number | null,
) {
  const invalidate = useThree((s) => s.invalidate);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Hand the DOM shell a way to request frames (context bar handlers).
  useEffect(() => {
    canvasBridge.invalidate = invalidate;
    return () => {
      canvasBridge.invalidate = null;
    };
  }, [invalidate]);

  // Settings drive shader behavior: colorize cross-fades via the tween
  // loop, and the hover field feeds the outline uniform each frame.
  const rgbColorize = useSettingsStore((s) => s.rgbColorize);
  const chromaColorize = useSettingsStore((s) => s.chromaColorize);
  useEffect(() => {
    sceneRef.current.rgbColorizeGoal = rgbColorize ? 1 : 0;
    sceneRef.current.chromaColorizeGoal = chromaColorize ? 1 : 0;
    invalidate();
  }, [rgbColorize, chromaColorize, invalidate, sceneRef]);

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
    sceneRef.current.hoverTile = hoverTile;
    invalidate();
  }, [hoverTile, invalidate, sceneRef]);

  // One stable uniforms object per texture. An inline object literal is a
  // NEW identity every render, so any re-render (e.g. hover state) made
  // R3F re-apply the prop and reset every uniform to its initial value —
  // uRgbColorize snapped to 0 and faded back up, which read as a flicker
  // on the RGB tiles whenever the cursor crossed tiles.
  const uniforms = useMemo(() => {
    if (!texture) return null;
    // Seed every CPU-eased uniform AT its current goal. A fresh material
    // (new image, hot reload) otherwise starts each at 0 and eases in,
    // which reads as a whole-grid flash — most visibly a gamma sweep
    // that crawls the saturation tile's shadow boundaries.
    const s = useSettingsStore.getState();
    const image = texture.image as HTMLCanvasElement;
    return {
      uSource: { value: texture },
      // One source texel in tile-UV units, for the chroma-smoothing taps.
      uTexelSize: { value: new THREE.Vector2(1 / image.width, 1 / image.height) },
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
      uHueMapStyle: { value: HUE_STYLE_INDEX[s.hueMapStyle] },
      uMidLevel: { value: s.midLevel },
      uNeutralTol: { value: s.neutralTolerance },
      uTileTransform: { value: s.tileLayout.map((k) => TILE_TRANSFORMS[k].id) },
      uTime: { value: 0 },
      uSrgbMath: { value: s.colorMath === "srgb" ? 1 : 0 },
    };
  }, [texture]);

  // Request a demand-mode frame only after the textured mesh has
  // committed; invalidating from the decode callback renders before the
  // mesh exists. Also re-sync the colorize goals onto the fresh material.
  useEffect(() => {
    if (!texture) return;
    const mat = materialRef.current;
    const st = sceneRef.current;
    if (mat) {
      mat.uniforms.uRgbColorize.value = st.rgbColorizeGoal;
      mat.uniforms.uChromaColorize.value = st.chromaColorizeGoal;
      mat.uniforms.uColorModel.value =
        useSettingsStore.getState().colorModel === "hsl" ? 1 : 0;
    }
    invalidate();
  }, [texture, invalidate, sceneRef]);

  useFrame((state, rawDt) => {
    const mat = materialRef.current;
    if (!mat) return;
    const st = sceneRef.current;
    const dt = Math.min(rawDt, 1 / 30);
    let active = false;
    const settings = useSettingsStore.getState();

    mat.uniforms.uHoverTile.value = st.hoverTile ?? -1;
    mat.uniforms.uHueMapStyle.value = HUE_STYLE_INDEX[settings.hueMapStyle];
    mat.uniforms.uMidLevel.value = settings.midLevel;
    mat.uniforms.uNeutralTol.value = settings.neutralTolerance;
    const slots = mat.uniforms.uTileTransform.value as number[];
    for (let i = 0; i < slots.length; i++) {
      slots[i] = TILE_TRANSFORMS[settings.tileLayout[i]].id;
    }

    // Exponential eases for the gamma and model cross-fades.
    const ease = (name: string, goal: number) => {
      const cur = mat.uniforms[name].value as number;
      if (Math.abs(goal - cur) > 0.002) {
        mat.uniforms[name].value = cur + (goal - cur) * (1 - Math.exp(-10 * dt));
        return true;
      }
      if (cur !== goal) mat.uniforms[name].value = goal;
      return false;
    };
    if (ease("uSrgbMath", settings.colorMath === "srgb" ? 1 : 0)) active = true;
    if (ease("uColorModel", settings.colorModel === "hsl" ? 1 : 0)) active = true;

    if (settings.hueMapStyle === "crawl") {
      // The crawl style animates: keep frames coming while selected.
      mat.uniforms.uTime.value += dt;
      active = true;
    }
    // Hue target snaps (no tween) — Taylor found the ease distracting.
    mat.uniforms.uTargetHue.value = st.hueGoal;

    if (state.camera instanceof THREE.OrthographicCamera) {
      const worldPerPx = 1 / state.camera.zoom;
      mat.uniforms.uUvPerPx.value.set(
        worldPerPx / ((aspect * PLANE_H) / 3),
        worldPerPx / (PLANE_H / 3),
      );
    }
    mat.uniforms.uHoverUv.value.set(st.hoverUv?.u ?? -1, st.hoverUv?.v ?? -1);
    mat.uniforms.uPinUv.value.set(st.pinUv?.u ?? -1, st.pinUv?.v ?? -1);

    const ui = useUiStore.getState();
    mat.uniforms.uPinnedTile.value = ui.pinnedTile ?? -1;
    mat.uniforms.uIsolateTile.value =
      ui.isolate && ui.framedTile !== null ? ui.framedTile : -1;
    mat.uniforms.uPeekTile.value =
      st.peek && st.zoomedTile !== null ? st.zoomedTile : -1;

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
    if (fade("uRgbColorize", st.rgbColorizeGoal)) active = true;
    if (fade("uChromaColorize", st.chromaColorizeGoal)) active = true;
    if (fade("uChromaSmooth", settings.chromaSmooth ? 1 : 0)) active = true;
    if (fade("uWarmCoolShade", settings.warmCoolShade ? 1 : 0)) active = true;

    if (active) invalidate();
  });

  return { materialRef, uniforms };
}
