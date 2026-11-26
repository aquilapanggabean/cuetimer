import { AppState, SavedRundown } from '../core/types';

const DB_NAME = 'CueTimerProductionDB';
const DB_VERSION = 2;
const STORE_EVENTS = 'events';
const STORE_SAVED_RUNDOWNS = 'savedRundowns';

const LS_ACTIVE_EVENT_KEY = 'cuetimer_active_event_v1';
const LS_LAST_RUNDOWN_KEY = 'cuetimer_last_rundown_v1';
const LS_SAVED_RUNDOWNS_KEY = 'cuetimer_saved_rundowns_v1';

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in current environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        db.createObjectStore(STORE_EVENTS, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(STORE_SAVED_RUNDOWNS)) {
        db.createObjectStore(STORE_SAVED_RUNDOWNS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeLocalStorageJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota exceeded or blocked
  }
}

function readLocalStorageJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function loadActiveEventSync(): AppState | null {
  return readLocalStorageJson<AppState>(LS_ACTIVE_EVENT_KEY);
}

export async function saveEventToDb(eventName: string, state: AppState): Promise<void> {
  if (eventName === 'current_active_event') {
    writeLocalStorageJson(LS_ACTIVE_EVENT_KEY, state);
  }
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_EVENTS, 'readwrite');
      const store = tx.objectStore(STORE_EVENTS);
      const record = {
        name: eventName,
        updatedAt: Date.now(),
        state
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // LocalStorage mirror already persisted
  }
}

export async function loadEventFromDb(eventName: string): Promise<AppState | null> {
  try {
    const db = await openDatabase();
    const res = await new Promise<AppState | null>((resolve, reject) => {
      const tx = db.transaction(STORE_EVENTS, 'readonly');
      const store = tx.objectStore(STORE_EVENTS);
      const req = store.get(eventName);
      req.onsuccess = () => {
        if (req.result && req.result.state) {
          resolve(req.result.state as AppState);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
    if (res) return res;
  } catch {
    // Fallback to localStorage
  }

  if (eventName === 'current_active_event') {
    return loadActiveEventSync();
  }
  return null;
}

export async function listEventsFromDb(): Promise<{ name: string; updatedAt: number }[]> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_EVENTS, 'readonly');
      const store = tx.objectStore(STORE_EVENTS);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = (req.result || []).map((r: { name: string; updatedAt: number }) => ({
          name: r.name,
          updatedAt: r.updatedAt
        }));
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export function loadLastUsedRundownSync(): SavedRundown | null {
  return readLocalStorageJson<SavedRundown>(LS_LAST_RUNDOWN_KEY);
}

export async function saveLastUsedRundown(rundown: SavedRundown): Promise<void> {
  writeLocalStorageJson(LS_LAST_RUNDOWN_KEY, rundown);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_EVENTS, 'readwrite');
      const store = tx.objectStore(STORE_EVENTS);
      const req = store.put({
        name: 'last_used_rundown',
        updatedAt: rundown.updatedAt,
        state: rundown
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // LocalStorage mirror already persisted
  }
}

export async function loadLastUsedRundown(): Promise<SavedRundown | null> {
  try {
    const db = await openDatabase();
    const res = await new Promise<SavedRundown | null>((resolve, reject) => {
      const tx = db.transaction(STORE_EVENTS, 'readonly');
      const store = tx.objectStore(STORE_EVENTS);
      const req = store.get('last_used_rundown');
      req.onsuccess = () => {
        if (req.result && req.result.state) {
          resolve(req.result.state as SavedRundown);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
    if (res) return res;
  } catch {
    // Fallback to localStorage
  }
  return loadLastUsedRundownSync();
}

export async function saveNamedRundown(rundown: SavedRundown): Promise<void> {
  const existing = readLocalStorageJson<SavedRundown[]>(LS_SAVED_RUNDOWNS_KEY) || [];
  const filtered = existing.filter((r) => r.id !== rundown.id);
  filtered.unshift(rundown);
  writeLocalStorageJson(LS_SAVED_RUNDOWNS_KEY, filtered);

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SAVED_RUNDOWNS, 'readwrite');
      const store = tx.objectStore(STORE_SAVED_RUNDOWNS);
      const req = store.put(rundown);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // LocalStorage mirror already persisted
  }
}

export async function listNamedRundowns(): Promise<SavedRundown[]> {
  try {
    const db = await openDatabase();
    const list = await new Promise<SavedRundown[]>((resolve, reject) => {
      const tx = db.transaction(STORE_SAVED_RUNDOWNS, 'readonly');
      const store = tx.objectStore(STORE_SAVED_RUNDOWNS);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []) as SavedRundown[];
        items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
    if (list.length) return list;
  } catch {
    // Fallback to localStorage
  }
  const lsList = readLocalStorageJson<SavedRundown[]>(LS_SAVED_RUNDOWNS_KEY) || [];
  return lsList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function loadNamedRundown(id: string): Promise<SavedRundown | null> {
  try {
    const db = await openDatabase();
    const found = await new Promise<SavedRundown | null>((resolve, reject) => {
      const tx = db.transaction(STORE_SAVED_RUNDOWNS, 'readonly');
      const store = tx.objectStore(STORE_SAVED_RUNDOWNS);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as SavedRundown) || null);
      req.onerror = () => reject(req.error);
    });
    if (found) return found;
  } catch {
    // Fallback
  }
  const lsList = readLocalStorageJson<SavedRundown[]>(LS_SAVED_RUNDOWNS_KEY) || [];
  return lsList.find((r) => r.id === id) || null;
}

export async function deleteNamedRundown(id: string): Promise<void> {
  const existing = readLocalStorageJson<SavedRundown[]>(LS_SAVED_RUNDOWNS_KEY) || [];
  writeLocalStorageJson(
    LS_SAVED_RUNDOWNS_KEY,
    existing.filter((r) => r.id !== id)
  );

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SAVED_RUNDOWNS, 'readwrite');
      const store = tx.objectStore(STORE_SAVED_RUNDOWNS);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore
  }
}
