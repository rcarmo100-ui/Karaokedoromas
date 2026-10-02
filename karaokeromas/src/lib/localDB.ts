/**
 * ════════════════════════════════════════════════════════════════════════════
 * LOCAL DATABASE — IndexedDB Layer
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Provides persistent local storage using IndexedDB.
 * This is the foundation of the LOCAL-FIRST architecture.
 *
 * Stores:
 *   - songs        → LocalSong records
 *   - syncQueue    → pending sync operations
 *   - processingQueue → local processing jobs
 *   - appSettings  → user preferences (sync enabled, storage limit, etc.)
 *
 * CHECKPOINT_1_CORE_LOCAL
 * ════════════════════════════════════════════════════════════════════════════
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncStatus = 'LOCAL_ONLY' | 'SYNC_PENDING' | 'SYNCED' | 'SYNC_ERROR';
export type LocalProcessingStatus = 'QUEUED' | 'PROCESSING' | 'DONE' | 'ERROR';

export interface LocalSong {
  id: string;                        // local UUID
  title: string;
  artist: string;
  genre: string;
  duration?: string;
  notes?: string;
  youtubeUrl?: string;
  coverColor?: string;

  // Local file references (blob URLs or object URLs stored as base64 or blob keys)
  localOriginalAudioKey?: string;    // key in 'audioBlobs' store
  localVocalsAudioKey?: string;
  localInstrumentalAudioKey?: string;
  localLyricsKey?: string;
  localCoverKey?: string;

  // Original file metadata
  originalFileName?: string;
  originalFileSize?: number;         // bytes
  originalFileMime?: string;

  // Processing
  processingStatus: LocalProcessingStatus;
  processingError?: string;

  // Sync
  syncStatus: SyncStatus;
  syncError?: string;
  cloudSongId?: string;              // Firestore document ID when synced
  cloudSyncEnabled: boolean;
  localOnly: boolean;

  // Timestamps
  createdAt: number;                 // Date.now()
  updatedAt: number;
}

export interface SyncQueueItem {
  id: string;
  songId: string;
  operation: 'UPLOAD_METADATA' | 'UPLOAD_AUDIO' | 'UPLOAD_LYRICS' | 'DELETE_CLOUD';
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'ERROR';
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
}

export interface LocalProcessingJob {
  id: string;
  songId: string;
  step: 'audio_preparation' | 'vocal_separation' | 'instrumental_generation' | 'lyrics_preparation' | 'finalization';
  status: LocalProcessingStatus;
  progress: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  key: string;
  value: unknown;
}

// ── DB constants ──────────────────────────────────────────────────────────────

const DB_NAME = 'karaoke-romas-local';
const DB_VERSION = 1;

const STORES = {
  SONGS: 'songs',
  AUDIO_BLOBS: 'audioBlobs',
  SYNC_QUEUE: 'syncQueue',
  PROCESSING_JOBS: 'processingJobs',
  APP_SETTINGS: 'appSettings',
} as const;

// ── DB initialization ─────────────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is not available in server-side rendering'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Songs store
      if (!db.objectStoreNames.contains(STORES.SONGS)) {
        const songsStore = db.createObjectStore(STORES.SONGS, { keyPath: 'id' });
        songsStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        songsStore.createIndex('processingStatus', 'processingStatus', { unique: false });
        songsStore.createIndex('createdAt', 'createdAt', { unique: false });
        songsStore.createIndex('cloudSongId', 'cloudSongId', { unique: false });
      }

      // Audio blobs store (stores raw binary data)
      if (!db.objectStoreNames.contains(STORES.AUDIO_BLOBS)) {
        db.createObjectStore(STORES.AUDIO_BLOBS, { keyPath: 'key' });
      }

      // Sync queue store
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        syncStore.createIndex('status', 'status', { unique: false });
        syncStore.createIndex('songId', 'songId', { unique: false });
      }

      // Processing jobs store
      if (!db.objectStoreNames.contains(STORES.PROCESSING_JOBS)) {
        const procStore = db.createObjectStore(STORES.PROCESSING_JOBS, { keyPath: 'id' });
        procStore.createIndex('songId', 'songId', { unique: false });
        procStore.createIndex('status', 'status', { unique: false });
      }

      // App settings store
      if (!db.objectStoreNames.contains(STORES.APP_SETTINGS)) {
        db.createObjectStore(STORES.APP_SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// ── Generic helpers ───────────────────────────────────────────────────────────

function txGet<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function txPut<T>(db: IDBDatabase, storeName: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function txDelete(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function txGetAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

function txGetByIndex<T>(db: IDBDatabase, storeName: string, indexName: string, value: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

// ── UUID generator ────────────────────────────────────────────────────────────

function generateId(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Songs CRUD ────────────────────────────────────────────────────────────────

export async function localSaveSong(song: Omit<LocalSong, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const db = await openDB();
  const id = generateId();
  const now = Date.now();
  const record: LocalSong = {
    ...song,
    id,
    createdAt: now,
    updatedAt: now,
  };
  await txPut(db, STORES.SONGS, record);
  return id;
}

export async function localGetSong(id: string): Promise<LocalSong | null> {
  const db = await openDB();
  return txGet<LocalSong>(db, STORES.SONGS, id);
}

export async function localGetAllSongs(): Promise<LocalSong[]> {
  const db = await openDB();
  const songs = await txGetAll<LocalSong>(db, STORES.SONGS);
  return songs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function localUpdateSong(id: string, updates: Partial<Omit<LocalSong, 'id' | 'createdAt'>>): Promise<void> {
  const db = await openDB();
  const existing = await txGet<LocalSong>(db, STORES.SONGS, id);
  if (!existing) throw new Error(`Song not found: ${id}`);
  const updated: LocalSong = { ...existing, ...updates, updatedAt: Date.now() };
  await txPut(db, STORES.SONGS, updated);
}

export async function localDeleteSong(id: string): Promise<void> {
  const db = await openDB();
  await txDelete(db, STORES.SONGS, id);
}

export async function localGetSongsBySync(syncStatus: SyncStatus): Promise<LocalSong[]> {
  const db = await openDB();
  return txGetByIndex<LocalSong>(db, STORES.SONGS, 'syncStatus', syncStatus);
}

export async function localGetSongByCloudId(cloudSongId: string): Promise<LocalSong | null> {
  const db = await openDB();
  const results = await txGetByIndex<LocalSong>(db, STORES.SONGS, 'cloudSongId', cloudSongId);
  return results[0] ?? null;
}

// ── Audio blob storage ────────────────────────────────────────────────────────

interface AudioBlobRecord {
  key: string;
  data: ArrayBuffer;
  mimeType: string;
  fileName: string;
  size: number;
  createdAt: number;
}

export async function localSaveAudioBlob(
  songId: string,
  type: 'original' | 'vocals' | 'instrumental' | 'lyrics' | 'cover',
  file: File
): Promise<string> {
  const db = await openDB();
  const key = `${songId}:${type}`;
  const buffer = await file.arrayBuffer();
  const record: AudioBlobRecord = {
    key,
    data: buffer,
    mimeType: file.type || 'audio/mpeg',
    fileName: file.name,
    size: file.size,
    createdAt: Date.now(),
  };
  await txPut(db, STORES.AUDIO_BLOBS, record);
  return key;
}

export async function localGetAudioBlob(key: string): Promise<{ blob: Blob; fileName: string; mimeType: string } | null> {
  const db = await openDB();
  const record = await txGet<AudioBlobRecord>(db, STORES.AUDIO_BLOBS, key);
  if (!record) return null;
  const blob = new Blob([record.data], { type: record.mimeType });
  return { blob, fileName: record.fileName, mimeType: record.mimeType };
}

export async function localGetAudioBlobUrl(key: string): Promise<string | null> {
  const result = await localGetAudioBlob(key);
  if (!result) return null;
  return URL.createObjectURL(result.blob);
}

export async function localDeleteAudioBlob(key: string): Promise<void> {
  const db = await openDB();
  await txDelete(db, STORES.AUDIO_BLOBS, key);
}

export async function localGetAudioBlobSize(key: string): Promise<number> {
  const db = await openDB();
  const record = await txGet<AudioBlobRecord>(db, STORES.AUDIO_BLOBS, key);
  return record?.size ?? 0;
}

// ── Sync queue ────────────────────────────────────────────────────────────────

export async function syncQueueAdd(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'updatedAt' | 'retryCount'>): Promise<string> {
  const db = await openDB();
  const id = generateId();
  const now = Date.now();
  const record: SyncQueueItem = { ...item, id, createdAt: now, updatedAt: now, retryCount: 0 };
  await txPut(db, STORES.SYNC_QUEUE, record);
  return id;
}

export async function syncQueueGetPending(): Promise<SyncQueueItem[]> {
  const db = await openDB();
  return txGetByIndex<SyncQueueItem>(db, STORES.SYNC_QUEUE, 'status', 'PENDING');
}

export async function syncQueueUpdate(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
  const db = await openDB();
  const existing = await txGet<SyncQueueItem>(db, STORES.SYNC_QUEUE, id);
  if (!existing) return;
  await txPut(db, STORES.SYNC_QUEUE, { ...existing, ...updates, updatedAt: Date.now() });
}

export async function syncQueueGetAll(): Promise<SyncQueueItem[]> {
  const db = await openDB();
  return txGetAll<SyncQueueItem>(db, STORES.SYNC_QUEUE);
}

export async function syncQueueDelete(id: string): Promise<void> {
  const db = await openDB();
  await txDelete(db, STORES.SYNC_QUEUE, id);
}

// ── Processing jobs ───────────────────────────────────────────────────────────

export async function localProcessingJobCreate(
  songId: string,
  step: LocalProcessingJob['step']
): Promise<string> {
  const db = await openDB();
  const id = generateId();
  const now = Date.now();
  const record: LocalProcessingJob = {
    id,
    songId,
    step,
    status: 'QUEUED',
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
  await txPut(db, STORES.PROCESSING_JOBS, record);
  return id;
}

export async function localProcessingJobUpdate(
  id: string,
  updates: Partial<Omit<LocalProcessingJob, 'id' | 'createdAt'>>
): Promise<void> {
  const db = await openDB();
  const existing = await txGet<LocalProcessingJob>(db, STORES.PROCESSING_JOBS, id);
  if (!existing) return;
  await txPut(db, STORES.PROCESSING_JOBS, { ...existing, ...updates, updatedAt: Date.now() });
}

export async function localProcessingJobsForSong(songId: string): Promise<LocalProcessingJob[]> {
  const db = await openDB();
  return txGetByIndex<LocalProcessingJob>(db, STORES.PROCESSING_JOBS, 'songId', songId);
}

// ── App settings ──────────────────────────────────────────────────────────────

export async function settingsGet<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const db = await openDB();
    const record = await txGet<AppSettings>(db, STORES.APP_SETTINGS, key);
    return record !== null ? (record.value as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function settingsSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  await txPut(db, STORES.APP_SETTINGS, { key, value });
}

// ── Storage usage ─────────────────────────────────────────────────────────────

export async function localGetTotalStorageBytes(): Promise<number> {
  const db = await openDB();
  const blobs = await txGetAll<AudioBlobRecord>(db, STORES.AUDIO_BLOBS);
  return blobs.reduce((sum, b) => sum + (b.size ?? 0), 0);
}

export async function localGetSongStorageBytes(songId: string): Promise<number> {
  const types: Array<'original' | 'vocals' | 'instrumental' | 'lyrics' | 'cover'> = [
    'original', 'vocals', 'instrumental', 'lyrics', 'cover',
  ];
  let total = 0;
  for (const type of types) {
    total += await localGetAudioBlobSize(`${songId}:${type}`);
  }
  return total;
}
