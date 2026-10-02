/**
 * ════════════════════════════════════════════════════════════════════════════
 * CLOUD IMPORT SERVICE — Firebase → Local
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Handles importing songs from Firebase (Firestore + Storage) to local
 * IndexedDB. Import is EXPLICIT and SELECTIVE — never automatic.
 *
 * What is imported per song:
 *   - Metadata (title, artist, genre, etc.)
 *   - originalAudio (when available in Storage)
 *   - vocalsAudio (when available)
 *   - instrumentalAudio (when available)
 *   - lyrics (when available)
 *
 * After import:
 *   - Song appears in local library
 *   - Song can be played offline
 *   - syncStatus = 'SYNCED'
 *   - cloudSongId preserved
 *
 * LOCAL_FIRST_V1.1
 * ════════════════════════════════════════════════════════════════════════════
 */

import { getRecentSongs, type SongDocument } from './firestoreService';
import { getFileDownloadUrl } from './storageService';
import {
  localSaveAudioBlob,
  localGetSongByCloudId,
  localSaveSong,
  localUpdateSong,
  localGetAudioBlobSize,
} from './localDB';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CloudSongInfo {
  cloudId: string;
  title: string;
  artist: string;
  genre: string;
  youtubeUrl?: string;
  notes?: string;
  coverColor?: string;
  duration?: string;
  status?: string;

  // Available files in Storage
  hasOriginalAudio: boolean;
  hasVocalsAudio: boolean;
  hasInstrumentalAudio: boolean;
  hasLyrics: boolean;

  // Estimated sizes (from Storage metadata or 0 if unknown)
  originalAudioPath?: string;
  vocalsAudioPath?: string;
  instrumentalAudioPath?: string;
  lyricsPath?: string;

  // Already imported locally?
  isLocallyImported: boolean;
  localId?: string;
}

export interface ImportProgress {
  phase: 'metadata' | 'original' | 'vocals' | 'instrumental' | 'lyrics' | 'done' | 'error';
  progress: number; // 0-100
  message: string;
}

export type ImportProgressCallback = (progress: ImportProgress) => void;

// ── List cloud songs ──────────────────────────────────────────────────────────

/**
 * Fetch all songs from Firestore and check which are already imported locally.
 * Returns enriched info for the import UI.
 */
export async function listCloudSongsForImport(limitCount = 200): Promise<CloudSongInfo[]> {
  const cloudSongs = await getRecentSongs(limitCount);

  const result: CloudSongInfo[] = await Promise.all(
    cloudSongs
      .filter((s): s is SongDocument & { id: string } => Boolean(s.id))
      .map(async (song) => {
        const existing = await localGetSongByCloudId(song.id!);

        return {
          cloudId: song.id!,
          title: song.title,
          artist: song.artist,
          genre: song.genre,
          youtubeUrl: song.youtubeUrl,
          notes: song.notes,
          coverColor: song.coverColor,
          duration: song.duration,
          status: song.status,

          hasOriginalAudio: Boolean(song.originalAudioPath),
          hasVocalsAudio: Boolean(song.vocalsAudioPath),
          hasInstrumentalAudio: Boolean(song.instrumentalAudioPath),
          hasLyrics: Boolean(song.lyricsPath),

          originalAudioPath: song.originalAudioPath,
          vocalsAudioPath: song.vocalsAudioPath,
          instrumentalAudioPath: song.instrumentalAudioPath,
          lyricsPath: song.lyricsPath,

          isLocallyImported: Boolean(existing),
          localId: existing?.id,
        };
      })
  );

  return result;
}

// ── Download a file from Storage ──────────────────────────────────────────────

/**
 * Download a file from Firebase Storage and return it as a File object.
 * Returns null if the path is not available or download fails.
 */
async function downloadStorageFile(
  storagePath: string,
  fileName: string,
  mimeType: string,
  onProgress?: (pct: number) => void
): Promise<File | null> {
  try {
    const downloadUrl = await getFileDownloadUrl(storagePath);

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Track download progress if possible
    const contentLength = response.headers.get('content-length');
    if (contentLength && onProgress) {
      let total = parseInt(contentLength, 10);
      const reader = response.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          onProgress(Math.round((received / total) * 100));
        }

        const blob = new Blob(chunks, { type: mimeType });
        return new File([blob], fileName, { type: mimeType });
      }
    }

    const blob = await response.blob();
    onProgress?.(100);
    return new File([blob], fileName, { type: mimeType || blob.type });
  } catch (err) {
    console.warn(`[cloudImport] Failed to download ${storagePath}:`, err);
    return null;
  }
}

// ── Import a single song ──────────────────────────────────────────────────────

/**
 * Import a single song from Firebase to local IndexedDB.
 * Downloads all available audio files.
 *
 * CRITICAL: This is EXPLICIT — never called automatically.
 */
export async function importSongFromCloud(
  cloudSong: CloudSongInfo,
  onProgress?: ImportProgressCallback
): Promise<{ localId: string; filesImported: string[] }> {
  const filesImported: string[] = [];

  onProgress?.({ phase: 'metadata', progress: 5, message: 'Salvando metadados...' });

  // Check if already imported
  const existing = await localGetSongByCloudId(cloudSong.cloudId);

  let localId: string;

  if (existing) {
    // Update existing local record
    localId = existing.id;
    await localUpdateSong(localId, {
      title: cloudSong.title,
      artist: cloudSong.artist,
      genre: cloudSong.genre,
      youtubeUrl: cloudSong.youtubeUrl,
      notes: cloudSong.notes,
      coverColor: cloudSong.coverColor,
      duration: cloudSong.duration,
      syncStatus: 'SYNCED',
      cloudSongId: cloudSong.cloudId,
      cloudSyncEnabled: true,
      localOnly: false,
    });
  } else {
    // Create new local record
    localId = await localSaveSong({
      title: cloudSong.title,
      artist: cloudSong.artist,
      genre: cloudSong.genre,
      youtubeUrl: cloudSong.youtubeUrl,
      notes: cloudSong.notes,
      coverColor: cloudSong.coverColor,
      duration: cloudSong.duration,
      processingStatus: 'DONE',
      syncStatus: 'SYNCED',
      cloudSongId: cloudSong.cloudId,
      cloudSyncEnabled: true,
      localOnly: false,
    });
  }

  filesImported.push('metadata');
  onProgress?.({ phase: 'metadata', progress: 10, message: 'Metadados salvos.' });

  // ── Download original audio ──────────────────────────────────────────────
  if (cloudSong.hasOriginalAudio && cloudSong.originalAudioPath) {
    onProgress?.({ phase: 'original', progress: 15, message: 'Baixando áudio original...' });
    try {
      const ext = cloudSong.originalAudioPath.split('.').pop() ?? 'mp3';
      const file = await downloadStorageFile(
        cloudSong.originalAudioPath,
        `original.${ext}`,
        'audio/mpeg',
        (pct) => {
          onProgress?.({
            phase: 'original',
            progress: 15 + Math.round(pct * 0.45),
            message: `Baixando áudio original... ${pct}%`,
          });
        }
      );

      if (file) {
        await localSaveAudioBlob(localId, 'original', file);
        await localUpdateSong(localId, {
          localOriginalAudioKey: `${localId}:original`,
          originalFileName: file.name,
          originalFileSize: file.size,
          originalFileMime: file.type,
        });
        filesImported.push('originalAudio');
        onProgress?.({ phase: 'original', progress: 60, message: 'Áudio original salvo.' });
      }
    } catch (err) {
      console.warn('[cloudImport] Failed to download original audio:', err);
      onProgress?.({ phase: 'original', progress: 60, message: 'Áudio original não disponível.' });
    }
  }

  // ── Download vocals audio ────────────────────────────────────────────────
  if (cloudSong.hasVocalsAudio && cloudSong.vocalsAudioPath) {
    onProgress?.({ phase: 'vocals', progress: 62, message: 'Baixando vocais...' });
    try {
      const ext = cloudSong.vocalsAudioPath.split('.').pop() ?? 'mp3';
      const file = await downloadStorageFile(
        cloudSong.vocalsAudioPath,
        `vocals.${ext}`,
        'audio/mpeg',
        (pct) => {
          onProgress?.({
            phase: 'vocals',
            progress: 62 + Math.round(pct * 0.1),
            message: `Baixando vocais... ${pct}%`,
          });
        }
      );
      if (file) {
        await localSaveAudioBlob(localId, 'vocals', file);
        await localUpdateSong(localId, { localVocalsAudioKey: `${localId}:vocals` });
        filesImported.push('vocalsAudio');
      }
    } catch (err) {
      console.warn('[cloudImport] Failed to download vocals:', err);
    }
    onProgress?.({ phase: 'vocals', progress: 72, message: 'Vocais processados.' });
  }

  // ── Download instrumental audio ──────────────────────────────────────────
  if (cloudSong.hasInstrumentalAudio && cloudSong.instrumentalAudioPath) {
    onProgress?.({ phase: 'instrumental', progress: 74, message: 'Baixando instrumental...' });
    try {
      const ext = cloudSong.instrumentalAudioPath.split('.').pop() ?? 'mp3';
      const file = await downloadStorageFile(
        cloudSong.instrumentalAudioPath,
        `instrumental.${ext}`,
        'audio/mpeg',
        (pct) => {
          onProgress?.({
            phase: 'instrumental',
            progress: 74 + Math.round(pct * 0.1),
            message: `Baixando instrumental... ${pct}%`,
          });
        }
      );
      if (file) {
        await localSaveAudioBlob(localId, 'instrumental', file);
        await localUpdateSong(localId, { localInstrumentalAudioKey: `${localId}:instrumental` });
        filesImported.push('instrumentalAudio');
      }
    } catch (err) {
      console.warn('[cloudImport] Failed to download instrumental:', err);
    }
    onProgress?.({ phase: 'instrumental', progress: 84, message: 'Instrumental processado.' });
  }

  // ── Download lyrics ──────────────────────────────────────────────────────
  if (cloudSong.hasLyrics && cloudSong.lyricsPath) {
    onProgress?.({ phase: 'lyrics', progress: 86, message: 'Baixando letra...' });
    try {
      const file = await downloadStorageFile(
        cloudSong.lyricsPath,
        'lyrics.lrc',
        'text/plain',
        (pct) => {
          onProgress?.({
            phase: 'lyrics',
            progress: 86 + Math.round(pct * 0.1),
            message: `Baixando letra... ${pct}%`,
          });
        }
      );
      if (file) {
        await localSaveAudioBlob(localId, 'lyrics', file);
        await localUpdateSong(localId, { localLyricsKey: `${localId}:lyrics` });
        filesImported.push('lyrics');
      }
    } catch (err) {
      console.warn('[cloudImport] Failed to download lyrics:', err);
    }
    onProgress?.({ phase: 'lyrics', progress: 96, message: 'Letra processada.' });
  }

  onProgress?.({ phase: 'done', progress: 100, message: 'Importação concluída!' });

  return { localId, filesImported };
}

// ── Estimate import size ──────────────────────────────────────────────────────

/**
 * Estimate total download size for a list of songs.
 * Since Storage doesn't expose file sizes without downloading,
 * we use a rough estimate based on duration or a default.
 *
 * Average MP3 bitrate: ~128 kbps = 16 KB/s
 * Average song duration: ~3.5 minutes = 210 seconds
 * Average size: ~3.3 MB per audio file
 */
export function estimateImportBytes(songs: CloudSongInfo[]): number {
  const AVG_AUDIO_BYTES = 3.5 * 1024 * 1024; // 3.5 MB per audio file
  let total = 0;

  for (const song of songs) {
    if (song.hasOriginalAudio) total += AVG_AUDIO_BYTES;
    if (song.hasVocalsAudio) total += AVG_AUDIO_BYTES;
    if (song.hasInstrumentalAudio) total += AVG_AUDIO_BYTES;
    if (song.hasLyrics) total += 50 * 1024; // ~50 KB for lyrics
  }

  return total;
}

// ── Get local storage used by an imported song ────────────────────────────────

export async function getImportedSongLocalBytes(localId: string): Promise<number> {
  const types = ['original', 'vocals', 'instrumental', 'lyrics'] as const;
  let total = 0;
  for (const type of types) {
    total += await localGetAudioBlobSize(`${localId}:${type}`);
  }
  return total;
}
