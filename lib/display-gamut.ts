"use client";

import { useEffect, useState } from "react";

/** The widest colour gamut the current display reports. */
export type DisplayGamut = "srgb" | "p3" | "rec2020";

export function detectDisplayGamut(): DisplayGamut {
  if (typeof window === "undefined" || !window.matchMedia) return "srgb";
  if (window.matchMedia("(color-gamut: rec2020)").matches) return "rec2020";
  if (window.matchMedia("(color-gamut: p3)").matches) return "p3";
  return "srgb";
}

export const GAMUT_LABEL: Record<DisplayGamut, string> = {
  srgb: "sRGB",
  p3: "Display P3",
  rec2020: "Rec. 2020",
};

/**
 * Live display gamut, re-evaluated when the window moves between
 * monitors. Surfaced in the inspector so users on wide-gamut displays
 * (most phones, many recent monitors) know the tiles are still
 * rendered in sRGB — see wiki/research/wide-gamut.md for what it would
 * take to change that.
 */
export function useDisplayGamut(): DisplayGamut {
  const [gamut, setGamut] = useState<DisplayGamut>(detectDisplayGamut);
  useEffect(() => {
    const queries = ["(color-gamut: p3)", "(color-gamut: rec2020)"].map((q) =>
      window.matchMedia(q),
    );
    const update = () => setGamut(detectDisplayGamut());
    update();
    for (const q of queries) q.addEventListener("change", update);
    return () => {
      for (const q of queries) q.removeEventListener("change", update);
    };
  }, []);
  return gamut;
}
