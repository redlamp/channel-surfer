"use client";

import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneRef } from "./scene-state";

export interface DecodedView {
  texture: THREE.Texture;
  aspect: number;
}

/**
 * One decode per image, shared by the texture and the pixel readouts.
 * createImageBitmap decodes off the main thread; the bitmap is drawn onto
 * one 2D canvas that serves BOTH as the GPU upload source and as the 1x1
 * readout surface. (The old path decoded twice — TextureLoader plus a
 * hidden <img> — and copied the full frame out with getImageData, which
 * is what made big images take tens of seconds.)
 *
 * The committed view swaps texture and aspect in together once a decode
 * lands, so the previous image (right aspect, live readouts) stays up for
 * the whole decode instead of a blank or stretched canvas.
 */
export function useImageDecode(
  sceneRef: SceneRef,
  blob: Blob,
  onDecoding: (busy: boolean) => void,
): DecodedView | null {
  const get = useThree((s) => s.get);
  const [view, setView] = useState<DecodedView | null>(null);

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
      sceneRef.current.readCtx = { ctx, width: canvas.width, height: canvas.height };
      setView({ texture: tex, aspect: nextAspect });
      onDecoding(false);
    })().catch((err) => {
      console.error("Image decode failed", err);
      if (!cancelled) onDecoding(false);
    });
    return () => {
      cancelled = true;
    };
  }, [blob, get, onDecoding, sceneRef]);

  // Dispose the GPU texture once a newer one has replaced it.
  const texture = view?.texture ?? null;
  useEffect(() => {
    if (!texture) return;
    return () => texture.dispose();
  }, [texture]);

  return view;
}
