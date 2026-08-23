/**
 * Minimal IndexedDB helper (wright-angles pattern). One DB, one object
 * store, and for now a single record: the current source image. Images
 * never leave the browser — this is the whole persistence layer.
 */

const DB_NAME = "channel-surfer";
const STORE = "media";
const VERSION = 1;
const CURRENT_KEY = "current";

export interface SourceRecord {
  blob: Blob;
  name: string;
  width: number;
  height: number;
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

export const idbPutCurrent = (record: SourceRecord) =>
  tx("readwrite", (s) => s.put(record, CURRENT_KEY));

export const idbGetCurrent = () =>
  tx<SourceRecord | undefined>("readonly", (s) => s.get(CURRENT_KEY));

export const idbClearCurrent = () =>
  tx("readwrite", (s) => s.delete(CURRENT_KEY));
