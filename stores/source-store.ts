"use client";

import { create } from "zustand";
import { probeImageDetails, type ImageDetails } from "@/lib/image-details";
import {
  idbDeleteItem,
  idbGetAllItems,
  idbGetCurrentId,
  idbPutItem,
  idbSetCurrentId,
  idbTakeLegacyCurrent,
  type MediaRecord,
} from "@/lib/idb";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Built-in demo images, shipped in public/demo/ (rainbows are lossless
 * WebP — pixel-identical to the PNG originals, ~38% smaller). First is
 * the default. */
const DEMO_DEFS = [
  { id: "demo", file: "smpte-bars.webp", name: "SMPTE bars" },
  { id: "demo-linear-rainbow", file: "linear-rainbow.webp", name: "Linear Rainbow" },
  { id: "demo-radial-rainbow", file: "radial-rainbow.webp", name: "Radial Rainbow" },
];

/** Id of the primary demo (the app's ultimate fallback). */
export const DEMO_ID = DEMO_DEFS[0].id;

export interface MediaItem {
  id: string;
  name: string;
  width: number;
  height: number;
  addedAt: number;
  /** Object URL for rendering and thumbnails. */
  url: string;
  blob: Blob;
}

interface SourceState {
  /** Library items, oldest first. Demo images are not part of this. */
  items: MediaItem[];
  /** Built-in demo images, in DEMO_DEFS order (empty until hydrate). */
  demoItems: MediaItem[];
  /** Selected item id — a library id or a demo id. */
  currentId: string;
  /** Header-sniffed details for the current selection, probed on every
   * selection change so "auto" color math and the library panel share
   * one lookup. Null until the probe lands. */
  currentDetails: ImageDetails | null;
  /** Convenience mirrors of the current selection for the canvas. */
  url: string | null;
  width: number;
  height: number;
  name: string;
  isDemo: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  loadFiles: (files: File[]) => Promise<void>;
  select: (id: string) => void;
  remove: (id: string) => Promise<void>;
  resetToDemo: () => void;
}

/** Intrinsic pixel size; also validates that the blob decodes as an image. */
async function probeImage(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function toItem(rec: MediaRecord): MediaItem {
  return {
    id: rec.id,
    name: rec.name,
    width: rec.width,
    height: rec.height,
    addedAt: rec.addedAt,
    url: URL.createObjectURL(rec.blob),
    blob: rec.blob,
  };
}

function selectionFields(src: MediaItem | null, isDemo: boolean) {
  return {
    url: src?.url ?? null,
    width: src?.width ?? 1,
    height: src?.height ?? 1,
    name: src?.name ?? "",
    isDemo,
    // Cleared here and refilled by probeDetails once the header parse
    // lands, so stale details never describe the new selection.
    currentDetails: null,
  };
}

/** Header-parse the selection in the background; ignore a result that
 * arrives after the user moved on. */
function probeDetails(
  item: MediaItem | null,
  set: (partial: { currentDetails: ImageDetails }) => void,
  get: () => { currentId: string },
) {
  if (!item) return;
  const id = item.id;
  void probeImageDetails(item.blob)
    .then((details) => {
      if (get().currentId === id) set({ currentDetails: details });
    })
    .catch(() => {});
}

const demoItemCache = new Map<string, MediaItem>();
async function loadDemoDef(d: (typeof DEMO_DEFS)[number]): Promise<MediaItem> {
  const cached = demoItemCache.get(d.id);
  if (cached) return cached;
  const res = await fetch(encodeURI(`${BASE}/demo/${d.file}`));
  if (!res.ok) throw new Error(`demo fetch ${res.status}`);
  const blob = await res.blob();
  const { width, height } = await probeImage(blob);
  const item = {
    id: d.id,
    name: `${d.name} (demo)`,
    width,
    height,
    addedAt: 0,
    url: URL.createObjectURL(blob),
    blob,
  };
  demoItemCache.set(d.id, item);
  return item;
}

/** All demos, in DEMO_DEFS order, skipping any that failed to load. */
async function loadAllDemos(): Promise<MediaItem[]> {
  const settled = await Promise.allSettled(DEMO_DEFS.map(loadDemoDef));
  return settled
    .filter(
      (s): s is PromiseFulfilledResult<MediaItem> => s.status === "fulfilled",
    )
    .map((s) => s.value);
}

const onIdle = (fn: () => void) => {
  if (typeof requestIdleCallback === "function")
    requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 1200);
};

export const useSourceStore = create<SourceState>((set, get) => ({
  items: [],
  demoItems: [],
  currentDetails: null,
  currentId: DEMO_ID,
  url: null,
  width: 1,
  height: 1,
  name: "",
  isDemo: true,
  error: null,

  hydrate: async () => {
    // The library hydrates first so a returning user's own image shows
    // without waiting on (or being blocked by) the demo downloads.
    let items: MediaItem[] = [];
    let savedId: string | null = null;
    try {
      // Migrate the pre-library single record, if present.
      const legacy = await idbTakeLegacyCurrent();
      if (legacy) {
        const rec: MediaRecord = { id: newId(), addedAt: Date.now(), ...legacy };
        await idbPutItem(rec);
        await idbSetCurrentId(rec.id);
      }
      const records = await idbGetAllItems();
      items = records.map(toItem);
      savedId = await idbGetCurrentId();
      if (legacy && !savedId && items.length > 0)
        savedId = items[items.length - 1].id;
    } catch {
      // Unreadable store — library stays empty, demos carry the app.
    }
    const item = savedId ? (items.find((i) => i.id === savedId) ?? null) : null;
    if (item) {
      set({ items, currentId: item.id, ...selectionFields(item, false) });
      probeDetails(item, set, get);
    } else {
      set({ items });
    }

    // Staged demo loading: only when a demo is needed as the immediate
    // fallback does one (the saved/default) fetch eagerly — the rest
    // wait for idle so they never compete with the startup path.
    const needFallback = !item && !get().url;
    if (needFallback) {
      const def =
        DEMO_DEFS.find((d) => d.id === savedId) ?? DEMO_DEFS[0];
      try {
        const first = await loadDemoDef(def);
        set({
          demoItems: [first],
          currentId: first.id,
          ...selectionFields(first, true),
        });
        probeDetails(first, set, get);
      } catch {
        set({ error: "Couldn't load the demo images." });
      }
    }
    onIdle(() => {
      void loadAllDemos().then((demos) => {
        if (demos.length === 0) return;
        const st = get();
        const demoSel = !st.url ? demos[0] : null;
        set(
          demoSel
            ? {
                demoItems: demos,
                currentId: demoSel.id,
                ...selectionFields(demoSel, true),
              }
            : { demoItems: demos },
        );
        if (demoSel) probeDetails(demoSel, set, get);
      });
    });
  },

  loadFiles: async (files) => {
    const added: MediaItem[] = [];
    let failed: string | null = null;
    for (const file of files) {
      try {
        const { width, height } = await probeImage(file);
        const rec: MediaRecord = {
          id: newId(),
          blob: file,
          name: file.name,
          width,
          height,
          addedAt: Date.now(),
        };
        // Persist best-effort; the in-memory item works even if IDB fails.
        void idbPutItem(rec).catch(() => {});
        added.push(toItem(rec));
      } catch {
        failed = `Couldn't read "${file.name}" as an image.`;
      }
    }
    if (added.length > 0) {
      const items = [...get().items, ...added];
      const current = added[added.length - 1];
      void idbSetCurrentId(current.id).catch(() => {});
      set({
        items,
        currentId: current.id,
        error: failed,
        ...selectionFields(current, false),
      });
      probeDetails(current, set, get);
    } else if (failed) {
      set({ error: failed });
    }
  },

  select: (id) => {
    const { items, demoItems } = get();
    const item = items.find((i) => i.id === id) ?? null;
    const demo = demoItems.find((d) => d.id === id) ?? null;
    const src = item ?? demo;
    if (!src) return;
    // Demo ids persist too, so a selected demo survives reloads.
    void idbSetCurrentId(id).catch(() => {});
    set({ currentId: id, ...selectionFields(src, item === null) });
    probeDetails(src, set, get);
  },

  remove: async (id) => {
    const { items, demoItems, currentId } = get();
    const removed = items.find((i) => i.id === id);
    if (!removed) return;
    const remaining = items.filter((i) => i.id !== id);
    URL.revokeObjectURL(removed.url);
    void idbDeleteItem(id).catch(() => {});
    if (currentId === id) {
      const next = remaining[remaining.length - 1] ?? demoItems[0] ?? null;
      const nextIsItem = remaining.some((i) => i.id === next?.id);
      void idbSetCurrentId(next?.id ?? null).catch(() => {});
      set({
        items: remaining,
        currentId: next?.id ?? DEMO_ID,
        ...selectionFields(next, !nextIsItem),
      });
      probeDetails(next, set, get);
    } else {
      set({ items: remaining });
    }
  },

  resetToDemo: () => {
    get().select(DEMO_ID);
  },
}));
