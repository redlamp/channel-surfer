/**
 * Minimal IndexedDB helper (wright-angles pattern). One DB, one object
 * store holding the media library: item records keyed by their id, plus a
 * pointer record for the current selection. Images never leave the
 * browser — this is the whole persistence layer.
 */

const DB_NAME = "channel-surfer";
const STORE = "media";
const VERSION = 1;
/** Pre-library versions stored a single record under this key. */
const LEGACY_KEY = "current";
const CURRENT_PTR_KEY = "library:currentId";

export interface MediaRecord {
  id: string;
  blob: Blob;
  name: string;
  width: number;
  height: number;
  addedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export const idbPutItem = (record: MediaRecord) =>
  tx("readwrite", (s) => s.put(record, record.id));

export const idbDeleteItem = (id: string) =>
  tx("readwrite", (s) => s.delete(id));

/** All library items, oldest first. Skips pointer and legacy records. */
export const idbGetAllItems = () =>
  tx<unknown[]>("readonly", (s) => s.getAll()).then(
    (records) =>
      records
        .filter(
          (r): r is MediaRecord =>
            typeof r === "object" &&
            r !== null &&
            "id" in r &&
            "blob" in r,
        )
        .sort((a, b) => a.addedAt - b.addedAt),
  );

export const idbSetCurrentId = (id: string | null) =>
  tx("readwrite", (s) => s.put({ currentId: id }, CURRENT_PTR_KEY));

export const idbGetCurrentId = () =>
  tx<{ currentId?: string | null } | undefined>("readonly", (s) =>
    s.get(CURRENT_PTR_KEY),
  ).then((r) => r?.currentId ?? null);

/** One-time migration of the single-image record from before the library. */
export const idbTakeLegacyCurrent = async () => {
  const legacy = await tx<
    { blob: Blob; name: string; width: number; height: number } | undefined
  >("readonly", (s) => s.get(LEGACY_KEY));
  if (!legacy || !("blob" in legacy)) return null;
  await tx("readwrite", (s) => s.delete(LEGACY_KEY));
  return legacy;
};
