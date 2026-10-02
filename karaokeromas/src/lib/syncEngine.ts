/**
 * ════════════════════════════════════════════════════════════════════════════
 * SYNC ENGINE — Firebase ↔ Local Sync
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Handles synchronization between local IndexedDB and Firebase.
 *
 * CRITICAL RULES:
 *   - Sync is DISABLED by default
 *   - User must explicitly trigger sync
 *   - NEVER delete local data on sync error
 *   - NEVER start large uploads without user confirmation
 *   - Firebase is OPTIONAL — app works fully without it
 *
 * States:
 *   SYNC_PENDING → SYNCING → SYNCED | SYNC_ERROR
 *
 * CHECKPOINT_4_SYNC_ENGINE
 * ════════════════════════════════════════════════════════════════════════════
 */

import { localGetAllSongs, localGetAudioBlob, localGetSongStorageBytes, syncQueueGetPending, type LocalSong, type SyncQueueItem,  } from './localDB';
import {
  repositoryMarkSynced,
  repositoryMarkSyncError,
  repositoryGetSongsBySync,
} from './songRepository';
import { isOnline, isSyncEnabled } from './connectivityManager';
import { addSong, updateSong } from './firestoreService';
import { uploadAudioFile } from './storageService';

// ── Sync state ────────────────────────────────────────────────────────────────

export type SyncEngineState = 'IDLE' | 'SYNCING' | 'ERROR';

interface SyncProgress {
  state: SyncEngineState;
  currentSong?: string;
  totalSongs: number;
  syncedSongs: number;
  errors: string[];
}

let syncState: SyncProgress = {
  state: 'IDLE',
  totalSongs: 0,
  syncedSongs: 0,
  errors: [],
};

type SyncProgressListener = (progress: SyncProgress) => void;
const progressListeners: Set<SyncProgressListener> = new Set();

function notifySyncProgress() {
  progressListeners.forEach((fn) => {
    try { fn({ ...syncState }); } catch { /* ignore */ }
  });
}

export function onSyncProgress(listener: SyncProgressListener): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

export function getSyncState(): SyncProgress {
  return { ...syncState };
}

// ── Sync analysis ─────────────────────────────────────────────────────────────

export interface SyncAnalysis {
  pendingSongs: LocalSong[];
  totalBytes: number;
  totalFiles: number;
  songDetails: Array<{
    song: LocalSong;
    bytes: number;
    hasOriginalAudio: boolean;
  }>;
}

/**
 * Analyze what would be synced without actually syncing.
 * Used to show the confirmation dialog before upload.
 */
export async function analyzePendingSync(): Promise<SyncAnalysis> {
  const pendingSongs = await repositoryGetSongsBySync('SYNC_PENDING');
  const localOnlySongs = await repositoryGetSongsBySync('LOCAL_ONLY');
  const allToSync = [...pendingSongs, ...localOnlySongs];

  let totalBytes = 0;
  let totalFiles = 0;
  const songDetails: SyncAnalysis['songDetails'] = [];

  for (const song of allToSync) {
    const bytes = await localGetSongStorageBytes(song.id);
    const hasOriginalAudio = Boolean(song.localOriginalAudioKey);
    if (hasOriginalAudio) totalFiles++;
    totalBytes += bytes;
    songDetails.push({ song, bytes, hasOriginalAudio });
  }

  return {
    pendingSongs: allToSync,
    totalBytes,
    totalFiles,
    songDetails,
  };
}

// ── Sync execution ────────────────────────────────────────────────────────────

/**
 * Sync a single song to Firebase.
 * Uploads metadata to Firestore, then uploads audio to Storage.
 *
 * CRITICAL: If any step fails, local data is preserved.
 */
async function syncSingleSong(
  song: LocalSong,
  onProgress?: (pct: number) => void
): Promise<void> {
  // Step 1: Upload metadata to Firestore
  let cloudSongId = song.cloudSongId;

  if (!cloudSongId) {
    cloudSongId = await addSong({
      title: song.title,
      artist: song.artist,
      genre: song.genre,
      youtubeUrl: song.youtubeUrl,
      notes: song.notes,
      status: 'queued',
    });
  } else {
    await updateSong(cloudSongId, {
      title: song.title,
      artist: song.artist,
      genre: song.genre,
      youtubeUrl: song.youtubeUrl,
      notes: song.notes,
    });
  }

  onProgress?.(20);

  // Step 2: Upload original audio if available
  if (song.localOriginalAudioKey) {
    const blobData = await localGetAudioBlob(song.localOriginalAudioKey);
    if (blobData) {
      const file = new File([blobData.blob], blobData.fileName, { type: blobData.mimeType });
      await uploadAudioFile(cloudSongId, file, 'original', (pct) => {
        onProgress?.(20 + Math.round(pct * 0.8));
      });
    }
  }

  onProgress?.(100);

  // Mark as synced locally
  await repositoryMarkSynced(song.id, cloudSongId);
}

/**
 * Execute sync for all pending songs.
 * Must be called explicitly by the user — never auto-triggered.
 *
 * @param songIds - Optional list of specific song IDs to sync. If empty, syncs all pending.
 * @param onItemProgress - Called with progress for each song (0-100)
 */
export async function executeSyncToCloud(
  songIds?: string[],
  onItemProgress?: (songId: string, pct: number) => void
): Promise<{ synced: number; errors: string[] }> {
  if (!isOnline()) {
    throw new Error('Sem conexão com a internet. Conecte-se para sincronizar.');
  }

  if (!isSyncEnabled()) {
    throw new Error('Sincronização está desativada. Ative nas configurações para sincronizar.');
  }

  const allSongs = await localGetAllSongs();
  let toSync: LocalSong[];

  if (songIds && songIds.length > 0) {
    toSync = allSongs.filter((s) => songIds.includes(s.id));
  } else {
    toSync = allSongs.filter(
      (s) => s.syncStatus === 'LOCAL_ONLY' || s.syncStatus === 'SYNC_PENDING' || s.syncStatus === 'SYNC_ERROR'
    );
  }

  syncState = {
    state: 'SYNCING',
    totalSongs: toSync.length,
    syncedSongs: 0,
    errors: [],
  };
  notifySyncProgress();

  let synced = 0;
  const errors: string[] = [];

  for (const song of toSync) {
    syncState.currentSong = song.title;
    notifySyncProgress();

    try {
      await syncSingleSong(song, (pct) => {
        onItemProgress?.(song.id, pct);
      });
      synced++;
      syncState.syncedSongs = synced;
      notifySyncProgress();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${song.title}: ${errorMsg}`);
      syncState.errors = [...errors];

      // CRITICAL: Mark sync error but NEVER delete local data
      await repositoryMarkSyncError(song.id, errorMsg).catch(() => {});
      notifySyncProgress();
    }
  }

  syncState = {
    state: errors.length > 0 ? 'ERROR' : 'IDLE',
    totalSongs: toSync.length,
    syncedSongs: synced,
    errors,
    currentSong: undefined,
  };
  notifySyncProgress();

  return { synced, errors };
}

// ── Pull from cloud ───────────────────────────────────────────────────────────

/**
 * Pull song metadata from Firebase to local.
 * Does NOT download audio files (too large).
 * Audio files remain in Firebase Storage and are streamed when needed.
 */
export async function pullSongsFromCloud(): Promise<{ imported: number; errors: string[] }> {
  if (!isOnline()) {
    throw new Error('Sem conexão com a internet.');
  }

  const { getRecentSongs } = await import('./firestoreService');
  const { repositoryImportFromCloud } = await import('./songRepository');

  const cloudSongs = await getRecentSongs(100);
  let imported = 0;
  const errors: string[] = [];

  for (const cloudSong of cloudSongs) {
    if (!cloudSong.id) continue;
    try {
      await repositoryImportFromCloud({
        id: cloudSong.id,
        title: cloudSong.title,
        artist: cloudSong.artist,
        genre: cloudSong.genre,
        youtubeUrl: cloudSong.youtubeUrl,
        notes: cloudSong.notes,
        coverColor: cloudSong.coverColor,
        duration: cloudSong.duration,
        status: cloudSong.status,
      });
      imported++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${cloudSong.title}: ${msg}`);
    }
  }

  return { imported, errors };
}

// ── Pending sync queue ────────────────────────────────────────────────────────

export async function getPendingSyncQueue(): Promise<SyncQueueItem[]> {
  return syncQueueGetPending();
}
