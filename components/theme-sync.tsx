"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";

/** Persisted settings key, shared with the pre-paint script in layout. */
export const SETTINGS_STORAGE_KEY = "channel-surfer:settings";

/**
 * Keeps the root element's `dark` class in step with the Theme setting
 * (and with the OS when the setting is "system"). The root layout also
 * runs a tiny inline script before first paint that reads the same
 * persisted value, so a light-theme user never sees a dark flash; this
 * component takes over once React is up.
 */
export function ThemeSync() {
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mql.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [theme]);
  return null;
}

/** Inline, pre-hydration version of the same rule. Runs from <head>. */
export const THEME_BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_STORAGE_KEY)})||"{}").state;var t=(s&&s.theme)||"dark";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;
