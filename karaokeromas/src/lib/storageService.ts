/**
 * ════════════════════════════════════════════════════════════════════════════
 * FIREBASE STORAGE SERVICE — Etapa 3A
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Manages audio and lyrics files in Firebase Storage.
 *
 * Storage bucket structure:
 *   audio/
 *     {songId}/
 *       original.{ext}        ← raw audio uploaded by user or extracted
 *       vocals.{ext}          ← vocal track (future: vocal separation)
 *       instrumental.{ext}    ← instrumental track (future: vocal separation)
 *   lyrics/
 *     {songId}/
 *       lyrics.lrc            ← LRC timestamped lyrics file
 *
 * Usage:
 *   import { uploadAudioFile, getAudioDownloadUrl, ... } from '@/lib/storageService';
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTask,
  StorageReference,
  UploadTaskSnapshot,
} from 'firebase/storage';
import { storage } from './firebase';

// ── Storage path helpers ──────────────────────────────────────────────────────

export const STORAGE_PATHS = {
  /** Path for the original audio file */
  originalAudio: (songId: string, ext = 'mp3') =>
    `audio/${songId}/original.${ext}`,

  /** Path for the separated vocals track (future) */
  vocalsAudio: (songId: string, ext = 'mp3') =>
    `audio/${songId}/vocals.${ext}`,

  /** Path for the separated instrumental track (future) */
  instrumentalAudio: (songId: string, ext = 'mp3') =>
    `audio/${songId}/instrumental.${ext}`,

  /** Path for the LRC lyrics file */
  lyricsLrc: (songId: string) =>
    `lyrics/${songId}/lyrics.lrc`,
} as const;

// ── Upload progress callback type ─────────────────────────────────────────────

export type UploadProgressCallback = (progress: number) => void;

// ── Audio upload ──────────────────────────────────────────────────────────────

/**
 * Upload an audio file to Firebase Storage.
 *
 * @param songId   - Firestore song document ID (used as folder name)
 * @param file     - Audio File object from an <input type="file"> element
 * @param type     - Which audio slot to fill: 'original' | 'vocals' | 'instrumental'
 * @param onProgress - Optional callback receiving upload progress 0–100
 * @returns Download URL of the uploaded file
 */
export async function uploadAudioFile(
  songId: string,
  file: File,
  type: 'original' | 'vocals' | 'instrumental' = 'original',
  onProgress?: UploadProgressCallback
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'mp3';
  const pathFn =
    type === 'vocals'
      ? STORAGE_PATHS.vocalsAudio
      : type === 'instrumental'
      ? STORAGE_PATHS.instrumentalAudio
      : STORAGE_PATHS.originalAudio;

  const storagePath = pathFn(songId, ext);
  const storageRef: StorageReference = ref(storage, storagePath);

  console.log('[uploadAudioFile] Starting upload:', { songId, type, storagePath, fileSize: file.size, fileType: file.type });

  const uploadTask: UploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type || 'audio/mpeg',
  });

  console.log('[uploadAudioFile] uploadBytesResumable() called — task created, waiting for state_changed callbacks...');

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const pct = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        console.log(`[uploadAudioFile] state_changed — state: ${snapshot.state}, progress: ${pct}%, bytes: ${snapshot.bytesTransferred}/${snapshot.totalBytes}`);
        if (onProgress) {
          onProgress(pct);
        }
      },
      (error) => {
        console.error('[uploadAudioFile] error callback fired:', error.code, error.message, error);
        reject(error);
      },
      async () => {
        console.log('[uploadAudioFile] complete callback fired — calling getDownloadURL...');
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('[uploadAudioFile] getDownloadURL succeeded:', downloadUrl);
          resolve(downloadUrl);
        } catch (urlError) {
          console.error('[uploadAudioFile] getDownloadURL failed after upload completed:', urlError);
          reject(urlError);
        }
      }
    );
  });
}

// ── Lyrics upload ─────────────────────────────────────────────────────────────

/**
 * Upload an LRC lyrics file to Firebase Storage.
 *
 * @param songId  - Firestore song document ID
 * @param file    - .lrc File object
 * @returns Download URL of the uploaded lyrics file
 */
export async function uploadLyricsFile(songId: string, file: File): Promise<string> {
  const storagePath = STORAGE_PATHS.lyricsLrc(songId);
  const storageRef: StorageReference = ref(storage, storagePath);

  const uploadTask: UploadTask = uploadBytesResumable(storageRef, file, {
    contentType: 'text/plain',
  });

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      () => {},
      (error) => reject(error),
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(downloadUrl);
      }
    );
  });
}

// ── Download URL ──────────────────────────────────────────────────────────────

/**
 * Get the public download URL for any file already in Storage.
 *
 * @param storagePath - Full path in the bucket (e.g. "audio/abc123/original.mp3")
 */
export async function getFileDownloadUrl(storagePath: string): Promise<string> {
  const storageRef: StorageReference = ref(storage, storagePath);
  return getDownloadURL(storageRef);
}

// ── Delete helpers ────────────────────────────────────────────────────────────

/**
 * Delete a single file from Storage by its path.
 */
export async function deleteStorageFile(storagePath: string): Promise<void> {
  const storageRef: StorageReference = ref(storage, storagePath);
  await deleteObject(storageRef);
}

/**
 * Delete all audio and lyrics files for a song.
 * Call this when deleting a song document from Firestore.
 *
 * NOTE: Firebase Storage does not support folder deletion natively.
 * This function deletes the known file paths individually.
 */
export async function deleteSongFiles(
  songId: string,
  audioExt = 'mp3'
): Promise<void> {
  const paths = [
    STORAGE_PATHS.originalAudio(songId, audioExt),
    STORAGE_PATHS.vocalsAudio(songId, audioExt),
    STORAGE_PATHS.instrumentalAudio(songId, audioExt),
    STORAGE_PATHS.lyricsLrc(songId),
  ];

  await Promise.allSettled(
    paths.map((p) =>
      deleteObject(ref(storage, p)).catch(() => {
        // File may not exist yet — ignore missing file errors
      })
    )
  );
}
