/**
 * ════════════════════════════════════════════════════════════════════════════
 * SONG REPOSITORY — Abstraction Layer (LOCAL-FIRST)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * This is the single access point for song data in the application.
 * Components MUST use this repository instead of accessing Firebase or
 * IndexedDB directly.
 *
 * Strategy:
 *   1. All writes go to LOCAL first (IndexedDB)
 *   2. Firebase is optional — used only when sync is explicitly triggered
 *   3. Reads come from local DB; Firebase data is merged on sync
 *
 * CHECKPOINT_1_CORE_LOCAL
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  localSaveSong,
  localGetSong,
  localGetAllSongs,
  localUpdateSong,
  localDeleteSong,
  localGetSongsBySync,
  localGetSongByCloudId,
  localSaveAudioBlob,
  localGetAudioBlobUrl,
  localDeleteAudioBlob,
  localGetSongStorageBytes,
  syncQueueAdd,
  type LocalSong,
  type SyncStatus,
} from './localDB';

// Re-export types for convenience
export type { LocalSong, SyncStatus };

// ── Song creation ─────────────────────────────────────────────────────────────

export interface CreateSongInput {
  title: string;
  artist: string;
  genre: string;
  youtubeUrl?: string;
  notes?: string;
  coverColor?: string;
}

/**
 * Create a new song in the local database.
 * The song starts as LOCAL_ONLY with QUEUED processing status.
 */
export async function repositoryCreateSong(input: CreateSongInput): Promise<string> {
  const id = await localSaveSong({
    title: input.title,
    artist: input.artist,
    genre: input.genre,
    youtubeUrl: input.youtubeUrl,
    notes: input.notes,
    coverColor: input.coverColor,
    processingStatus: 'QUEUED',
    syncStatus: 'LOCAL_ONLY',
    cloudSyncEnabled: false,
    localOnly: true,
  });
  return id;
}

/**
 * Save an audio file locally for a song.
 * Returns the blob key for later retrieval.
 */
export async function repositorySaveAudioFile(
  songId: string,
  type: 'original' | 'vocals' | 'instrumental' | 'lyrics' | 'cover',
  file: File
): Promise<string> {
  const key = await localSaveAudioBlob(songId, type, file);

  // Update song record with the key reference
  const fieldMap: Record<string, keyof LocalSong> = {
    original: 'localOriginalAudioKey',
    vocals: 'localVocalsAudioKey',
    instrumental: 'localInstrumentalAudioKey',
    lyrics: 'localLyricsKey',
    cover: 'localCoverKey',
  };

  const field = fieldMap[type];
  if (field) {
    await localUpdateSong(songId, {
      [field]: key,
      originalFileName: type === 'original' ? file.name : undefined,
      originalFileSize: type === 'original' ? file.size : undefined,
      originalFileMime: type === 'original' ? file.type : undefined,
    } as Partial<LocalSong>);
  }

  return key;
}

/**
 * Get a playable URL for a locally stored audio file.
 * Returns null if the file is not stored locally.
 */
export async function repositoryGetAudioUrl(
  songId: string,
  type: 'original' | 'vocals' | 'instrumental' | 'lyrics' | 'cover'
): Promise<string | null> {
  const key = `${songId}:${type}`;
  return localGetAudioBlobUrl(key);
}

// ── Song reads ────────────────────────────────────────────────────────────────

export async function repositoryGetSong(id: string): Promise<LocalSong | null> {
  return localGetSong(id);
}

export async function repositoryGetAllSongs(): Promise<LocalSong[]> {
  return localGetAllSongs();
}

export async function repositoryGetRecentSongs(limit = 20): Promise<LocalSong[]> {
  const all = await localGetAllSongs();
  return all.slice(0, limit);
}

export async function repositoryGetSongsBySync(syncStatus: SyncStatus): Promise<LocalSong[]> {
  return localGetSongsBySync(syncStatus);
}

export async function repositoryGetSongByCloudId(cloudSongId: string): Promise<LocalSong | null> {
  return localGetSongByCloudId(cloudSongId);
}

// ── Song updates ──────────────────────────────────────────────────────────────

export async function repositoryUpdateSong(
  id: string,
  updates: Partial<Omit<LocalSong, 'id' | 'createdAt'>>
): Promise<void> {
  await localUpdateSong(id, updates);
}

export async function repositoryMarkSyncPending(songId: string): Promise<void> {
  await localUpdateSong(songId, { syncStatus: 'SYNC_PENDING' });
  // Add to sync queue
  await syncQueueAdd({
    songId,
    operation: 'UPLOAD_METADATA',
    status: 'PENDING',
  });
}

export async function repositoryMarkSynced(songId: string, cloudSongId: string): Promise<void> {
  await localUpdateSong(songId, {
    syncStatus: 'SYNCED',
    cloudSongId,
    localOnly: false,
    syncError: undefined,
  });
}

export async function repositoryMarkSyncError(songId: string, error: string): Promise<void> {
  await localUpdateSong(songId, {
    syncStatus: 'SYNC_ERROR',
    syncError: error,
  });
  // CRITICAL: Never delete local data on sync error
}

// ── Song deletion ─────────────────────────────────────────────────────────────

/**
 * Delete a song from local storage.
 * This does NOT delete from Firebase — use SyncEngine for cloud deletion.
 */
export async function repositoryDeleteSongLocally(id: string): Promise<void> {
  // Delete audio blobs
  const types: Array<'original' | 'vocals' | 'instrumental' | 'lyrics' | 'cover'> = [
    'original', 'vocals', 'instrumental', 'lyrics', 'cover',
  ];
  for (const type of types) {
    await localDeleteAudioBlob(`${id}:${type}`).catch(() => {});
  }
  await localDeleteSong(id);
}

// ── Storage info ──────────────────────────────────────────────────────────────

export async function repositoryGetSongStorageBytes(songId: string): Promise<number> {
  return localGetSongStorageBytes(songId);
}

// ── Import from Firebase (used during sync) ───────────────────────────────────

/**
 * Import a song from Firestore into the local database.
 * Used when pulling cloud data to local.
 * If a local record with the same cloudSongId exists, it is updated.
 */
export async function repositoryImportFromCloud(cloudSong: {
  id: string;
  title: string;
  artist: string;
  genre: string;
  youtubeUrl?: string;
  notes?: string;
  coverColor?: string;
  duration?: string;
  status?: string;
}): Promise<string> {
  // Check if already imported
  const existing = await localGetSongByCloudId(cloudSong.id);
  if (existing) {
    // Update existing local record
    await localUpdateSong(existing.id, {
      title: cloudSong.title,
      artist: cloudSong.artist,
      genre: cloudSong.genre,
      youtubeUrl: cloudSong.youtubeUrl,
      notes: cloudSong.notes,
      coverColor: cloudSong.coverColor,
      duration: cloudSong.duration,
      syncStatus: 'SYNCED',
      cloudSongId: cloudSong.id,
    });
    return existing.id;
  }

  // Create new local record
  const localId = await localSaveSong({
    title: cloudSong.title,
    artist: cloudSong.artist,
    genre: cloudSong.genre,
    youtubeUrl: cloudSong.youtubeUrl,
    notes: cloudSong.notes,
    coverColor: cloudSong.coverColor,
    duration: cloudSong.duration,
    processingStatus: 'DONE',
    syncStatus: 'SYNCED',
    cloudSongId: cloudSong.id,
    cloudSyncEnabled: true,
    localOnly: false,
  });

  return localId;
}
