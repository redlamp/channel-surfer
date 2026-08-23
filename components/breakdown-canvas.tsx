"use client";

import { useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  breakdownFragmentShader,
  breakdownVertexShader,
} from "@/lib/shaders/breakdown";
import { useSourceStore } from "@/stores/source-store";

function BreakdownQuad({ url }: { url: string }) {
  const invalidate = useThree((s) => s.invalidate);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

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
      setTexture(tex);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Request a demand-mode frame only after the textured mesh has committed;
  // invalidating from the loader callback renders before the mesh exists.
  useEffect(() => {
    if (!texture) return;
    invalidate();
    return () => texture.dispose();
  }, [texture, invalidate]);

  if (!texture) return null;

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      {/* Remount the material per texture so the uniform stays in sync. */}
      <shaderMaterial
        key={texture.uuid}
        vertexShader={breakdownVertexShader}
        fragmentShader={breakdownFragmentShader}
        uniforms={{ uSource: { value: texture } }}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * The 3x3 breakdown grid. The wrapper keeps the source image's aspect
 * ratio (a uniform 3x3 grid of full-image tiles has the same aspect as one
 * tile) and fits inside whatever space the parent grants.
 */
export function BreakdownCanvas() {
  const url = useSourceStore((s) => s.url);
  const width = useSourceStore((s) => s.width);
  const height = useSourceStore((s) => s.height);

  if (!url) {
    return (
      <p className="text-base text-muted-foreground">Loading image…</p>
    );
  }

  return (
    <div
      className="max-h-full w-full overflow-hidden rounded-md border border-border"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: false, preserveDrawingBuffer: true }}
      >
        <BreakdownQuad url={url} />
      </Canvas>
    </div>
  );
}
