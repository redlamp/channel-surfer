"use client";

import { useEffect, useState } from "react";

/** Live match for a CSS media query. SSR is off for the app shell, so
 * the first render already reflects the real viewport. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Below Tailwind's `md` (48rem): the inspector becomes a bottom sheet
 * and long-press stands in for right-click. */
export const NARROW_QUERY = "(max-width: 47.99rem)";
