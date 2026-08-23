"use client";

import { create } from "zustand";
import {
  idbDeleteItem,
  idbGetAllItems,
  idbGetCurrentId,
  idbPutItem,
  idbSetCurrentId,
  idbTakeLegacyCurrent,
  type MediaRecord,
} from "@/lib/idb";

const DEMO_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/demo/smpte-bars.png`;
export const DEMO_ID = "demo";
const DEMO_NAME = "SMPTE bars (demo)";

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
  /** Library items, oldest first. The demo image is not part of this. */
  items: MediaItem[];
  /** Selected item id; DEMO_ID when viewing the fallback demo image. */
  currentId: string;
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
  /** The demo image's blob once fetched (for the details panel). */
  demoBlob: Blob | null;
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

function selectionFields(item: MediaItem | null, demo: MediaItem | null) {
  const src = item ?? demo;
  return {
    url: src?.url ?? null,
    width: src?.width ?? 1,
    height: src?.height ?? 1,
    name: src?.name ?? "",
    isDemo: item === null,
  };
}

let demoItem: MediaItem | null = null;
async function fetchDemo(): Promise<MediaItem> {
  if (demoItem) return demoItem;
  const blob = await fetch(DEMO_PATH).then((r) => r.blob());
  const { width, height } = await probeImage(blob);
  demoItem = {
    id: DEMO_ID,
    name: DEMO_NAME,
    width,
    height,
    addedAt: 0,
    url: URL.createObjectURL(blob),
    blob,
  };
  return demoItem;
}

export const useSourceStore = create<SourceState>((set, get) => ({
  items: [],
  currentId: DEMO_ID,
  url: null,
  width: 1,
  height: 1,
  name: "",
  isDemo: true,
  error: null,
  demoBlob: null,

  hydrate: async () => {
    const demo = await fetchDemo();
    let items: MediaItem[] = [];
    let currentId: string = DEMO_ID;
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
      const savedId = await idbGetCurrentId();
      if (savedId && items.some((i) => i.id === savedId)) currentId = savedId;
      else if (legacy && items.length > 0) currentId = items[items.length - 1].id;
    } catch {
      // Unreadable store — library stays empty, demo carries the app.
    }
    const item = items.find((i) => i.id === currentId) ?? null;
    set({
      items,
      currentId: item ? currentId : DEMO_ID,
      demoBlob: demo.blob,
      ...selectionFields(item, demo),
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
        ...selectionFields(current, demoItem),
      });
    } else if (failed) {
      set({ error: failed });
    }
  },

  select: (id) => {
    const item = get().items.find((i) => i.id === id) ?? null;
    if (id !== DEMO_ID && !item) return;
    void idbSetCurrentId(item ? id : null).catch(() => {});
    set({
      currentId: item ? id : DEMO_ID,
      ...selectionFields(item, demoItem),
    });
  },

  remove: async (id) => {
    const { items, currentId } = get();
    const removed = items.find((i) => i.id === id);
    if (!removed) return;
    const remaining = items.filter((i) => i.id !== id);
    URL.revokeObjectURL(removed.url);
    void idbDeleteItem(id).catch(() => {});
    if (currentId === id) {
      const next = remaining[remaining.length - 1] ?? null;
      void idbSetCurrentId(next?.id ?? null).catch(() => {});
      set({
        items: remaining,
        currentId: next?.id ?? DEMO_ID,
        ...selectionFields(next, demoItem),
      });
    } else {
      set({ items: remaining });
    }
  },

  resetToDemo: () => {
    void idbSetCurrentId(null).catch(() => {});
    set({ currentId: DEMO_ID, ...selectionFields(null, demoItem) });
  },
}));
