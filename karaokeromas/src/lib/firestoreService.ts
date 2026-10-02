/**
 * ════════════════════════════════════════════════════════════════════════════
 * FIRESTORE SERVICE — Etapa 3A + Sprint Real Processing
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Manages two Firestore collections:
 *
 *   songs/
 *     {songId}                ← SongDocument (metadata)
 *       processingJobs/
 *         {jobId}             ← ProcessingJobDocument (status)
 *
 * Usage:
 *   import { addSong, getSong, updateSongStatus, observeSong, observeProcessingJob, ... } from '@/lib/firestoreService';
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  Timestamp,
  DocumentReference,
  CollectionReference,
  deleteField,
} from 'firebase/firestore';
import { db } from './firebase';
import { app } from './firebase';

// ── Collection names ─────────────────────────────────────────────────────────

export const COLLECTIONS = {
  SONGS: 'songs',
  PROCESSING_JOBS: 'processingJobs',
} as const;

// ── Document interfaces ───────────────────────────────────────────────────────

/** Song processing/readiness status */
export type SongStatus = 'pending' | 'queued' | 'processing' | 'ready' | 'error' | 'demo';

/** Stored in Firestore under songs/{songId} */
export interface SongDocument {
  id?: string;
  title: string;
  artist: string;
  genre: string;
  youtubeUrl?: string;
  /** Path in Firebase Storage: audio/{songId}/original.* */
  originalAudioPath?: string;
  /** Path in Firebase Storage: audio/{songId}/vocals.* */
  vocalsAudioPath?: string;
  /** Path in Firebase Storage: audio/{songId}/instrumental.* */
  instrumentalAudioPath?: string;
  /** Path in Firebase Storage: lyrics/{songId}/lyrics.lrc */
  lyricsPath?: string;
  status: SongStatus;
  duration?: string;
  coverColor?: string;
  /** Personal notes about the song (tone, version, etc.) */
  notes?: string;
  addedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** Processing job status — stored under songs/{songId}/processingJobs/{jobId} */
export type ProcessingStep =
  | 'audio_extraction' |'vocal_separation' |'lyrics_sync' |'finalization';

export type ProcessingJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface ProcessingJobDocument {
  id?: string;
  songId: string;
  step: ProcessingStep;
  status: ProcessingJobStatus;
  progress: number; // 0–100
  errorMessage?: string;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
}

// ── Helper: collection refs ───────────────────────────────────────────────────

function songsCol(): CollectionReference {
  return collection(db, COLLECTIONS.SONGS);
}

function processingJobsCol(songId: string): CollectionReference {
  return collection(db, COLLECTIONS.SONGS, songId, COLLECTIONS.PROCESSING_JOBS);
}

// ── Helper: strip undefined fields ───────────────────────────────────────────

/**
 * Returns a shallow copy of `obj` with all keys whose value is `undefined`
 * removed. Firestore rejects documents that contain `undefined` values.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

// ── Helper: timeout wrapper for Firestore calls ───────────────────────────────

/**
 * Wraps a Promise with a timeout. If the Promise does not resolve/reject
 * within `ms` milliseconds, it rejects with a descriptive error.
 * This prevents Firestore calls from hanging indefinitely when the project
 * is misconfigured or the network is unavailable.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `[Firestore] ${label} timed out after ${ms / 1000}s. ` +
          `Possible causes: invalid Firebase project ID, missing API key, ` +
          `Firestore not enabled in the Firebase Console, or network issue. ` +
          `Check NEXT_PUBLIC_FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_API_KEY in your .env file.`
        )
      );
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err)   => { clearTimeout(timer); reject(err); }
    );
  });
}

// ── Songs CRUD ────────────────────────────────────────────────────────────────

/**
 * Add a new song document to Firestore.
 * Returns the auto-generated document ID.
 */
export async function addSong(
  data: Omit<SongDocument, 'id' | 'addedAt' | 'updatedAt'>
): Promise<string> {
  console.log('[firestoreService] addSong: starting');

  // ── Config diagnostics — read from the already-initialized app instance ──
  // Do NOT read process.env here; firebase.ts already resolved the real values.
  const appOptions = app.options as {
    apiKey?: string;
    authDomain?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
    projectId?: string;
  };

  const PLACEHOLDER_PREFIXES = ['your-', 'placeholder', 'undefined', 'null', ''];
  const isPlaceholder = (v: string | undefined) =>
    !v || PLACEHOLDER_PREFIXES.some((p) => v.toLowerCase().startsWith(p) || v.toLowerCase() === p);

  console.log('[firestoreService] addSong: Firebase config check —', {
    projectId: appOptions.projectId ?? '(undefined)',
    hasApiKey: !!appOptions.apiKey && !isPlaceholder(appOptions.apiKey),
    hasAuthDomain: !!appOptions.authDomain && !isPlaceholder(appOptions.authDomain),
    hasStorageBucket: !!appOptions.storageBucket && !isPlaceholder(appOptions.storageBucket),
    hasMessagingSenderId: !!appOptions.messagingSenderId && !isPlaceholder(appOptions.messagingSenderId),
    hasAppId: !!appOptions.appId && !isPlaceholder(appOptions.appId),
  });

  // ── Verify db is using the correct Firebase App ─────────────────────────
  const dbApp = (db as unknown as { _delegate?: { _databaseId?: { projectId?: string } } })
    ?._delegate?._databaseId?.projectId;
  console.log('[firestoreService] addSong: Firestore app verification —', {
    firebaseAppName: app.name,
    firebaseAppProjectId: appOptions.projectId ?? '(not set)',
    firestoreReportedProjectId: dbApp ?? '(unable to read)',
    projectIdsMatch: dbApp ? dbApp === appOptions.projectId : 'unknown',
  });

  const payload = {
    ...stripUndefined(data as Record<string, unknown>),
    addedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  console.log('[firestoreService] addSong: data prepared —', Object.keys(payload));

  console.log('[firestoreService] addSong: calling addDoc...');
  let docRef: DocumentReference;
  try {
    docRef = await withTimeout(
      addDoc(songsCol(), payload),
      15000,
      'addSong/addDoc'
    );
  } catch (err) {
    // Capture error.code and error.message without exposing credentials
    const firebaseErr = err as { code?: string; message?: string };
    console.error('[firestoreService] addSong: addDoc FAILED —', {
      code: firebaseErr?.code ?? 'no-code',
      message: firebaseErr?.message ?? String(err),
    });
    throw err;
  }
  console.log('[firestoreService] addSong: addDoc returned — docRef.id:', docRef.id);
  console.log('[firestoreService] addSong: completed — songId:', docRef.id);
  return docRef.id;
}

/**
 * Fetch a single song by ID.
 * Returns null if not found.
 */
export async function getSong(songId: string): Promise<SongDocument | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.SONGS, songId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<SongDocument, 'id'>) };
}

/**
 * Fetch the most recent songs (default: 20).
 */
export async function getRecentSongs(limitCount = 20): Promise<SongDocument[]> {
  const q = query(songsCol(), orderBy('addedAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SongDocument, 'id'>) }));
}

/**
 * Update specific fields on a song document.
 */
export async function updateSong(
  songId: string,
  data: Partial<Omit<SongDocument, 'id' | 'addedAt'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.SONGS, songId), {
    ...stripUndefined(data as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Convenience: update only the song's status field.
 */
export async function updateSongStatus(songId: string, status: SongStatus): Promise<void> {
  await updateSong(songId, { status });
}

/**
 * Delete a song document (and its subcollections must be deleted separately).
 */
export async function deleteSong(songId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.SONGS, songId));
}

// ── Real-time observers ───────────────────────────────────────────────────────

/**
 * Subscribe to real-time updates for a song document.
 * Returns an unsubscribe function.
 *
 * @param songId - The song document ID
 * @param onData - Called with the latest SongDocument (or null if not found)
 * @param onError - Called if the listener encounters an error
 */
export function observeSong(
  songId: string,
  onData: (song: SongDocument | null) => void,
  onError?: (err: Error) => void
): () => void {
  let docRef = doc(db, COLLECTIONS.SONGS, songId);
  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
      } else {
        onData({ id: snap.id, ...(snap.data() as Omit<SongDocument, 'id'>) });
      }
    },
    (err) => {
      console.error('[observeSong] Firestore listener error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to real-time updates for a specific processing job.
 * Returns an unsubscribe function.
 *
 * @param songId - The parent song document ID
 * @param jobId - The processing job document ID
 * @param onData - Called with the latest ProcessingJobDocument (or null if not found)
 * @param onError - Called if the listener encounters an error
 */
export function observeProcessingJob(
  songId: string,
  jobId: string,
  onData: (job: ProcessingJobDocument | null) => void,
  onError?: (err: Error) => void
): () => void {
  let docRef = doc(db, COLLECTIONS.SONGS, songId, COLLECTIONS.PROCESSING_JOBS, jobId);
  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
      } else {
        onData({ id: snap.id, ...(snap.data() as Omit<ProcessingJobDocument, 'id'>) });
      }
    },
    (err) => {
      console.error('[observeProcessingJob] Firestore listener error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to real-time updates for ALL processing jobs of a song.
 * Returns an unsubscribe function.
 *
 * @param songId - The parent song document ID
 * @param onData - Called with the latest array of ProcessingJobDocument
 * @param onError - Called if the listener encounters an error
 */
export function observeProcessingJobs(
  songId: string,
  onData: (jobs: ProcessingJobDocument[]) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = processingJobsCol(songId);
  return onSnapshot(
    colRef,
    (snap) => {
      const jobs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ProcessingJobDocument, 'id'>),
      }));
      onData(jobs);
    },
    (err) => {
      console.error('[observeProcessingJobs] Firestore listener error:', err);
      if (onError) onError(err);
    }
  );
}

// ── Processing Jobs CRUD ──────────────────────────────────────────────────────

/**
 * Create a new processing job under songs/{songId}/processingJobs.
 * Returns the auto-generated job ID.
 */
export async function createProcessingJob(
  songId: string,
  step: ProcessingStep
): Promise<string> {
  console.log('[firestoreService] createProcessingJob: starting —', { songId, step });
  const jobData: Omit<ProcessingJobDocument, 'id'> = {
    songId,
    step,
    status: 'queued',
    progress: 0,
    startedAt: null,
    completedAt: null,
  };
  console.log('[firestoreService] createProcessingJob: calling addDoc...');
  let docRef: DocumentReference;
  try {
    docRef = await withTimeout(
      addDoc(processingJobsCol(songId), jobData),
      15000,
      'createProcessingJob/addDoc'
    );
  } catch (err) {
    console.error('[firestoreService] createProcessingJob: addDoc FAILED —', err);
    throw err;
  }
  console.log('[firestoreService] createProcessingJob: completed — jobId:', docRef.id);
  return docRef.id;
}

/**
 * Fetch a specific processing job.
 */
export async function getProcessingJob(
  songId: string,
  jobId: string
): Promise<ProcessingJobDocument | null> {
  const snap = await getDoc(
    doc(db, COLLECTIONS.SONGS, songId, COLLECTIONS.PROCESSING_JOBS, jobId)
  );
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<ProcessingJobDocument, 'id'>) };
}

/**
 * Fetch all processing jobs for a song.
 */
export async function getProcessingJobs(songId: string): Promise<ProcessingJobDocument[]> {
  const snap = await getDocs(processingJobsCol(songId));
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ProcessingJobDocument, 'id'>),
  }));
}

/**
 * Update a processing job's status and progress.
 */
export async function updateProcessingJob(
  songId: string,
  jobId: string,
  data: Partial<Omit<ProcessingJobDocument, 'id' | 'songId'>>
): Promise<void> {
  await updateDoc(
    doc(db, COLLECTIONS.SONGS, songId, COLLECTIONS.PROCESSING_JOBS, jobId),
    stripUndefined(data as Record<string, unknown>)
  );
}

/**
 * Mark a processing job as done and record completion time.
 */
export async function completeProcessingJob(songId: string, jobId: string): Promise<void> {
  await updateProcessingJob(songId, jobId, {
    status: 'done',
    progress: 100,
    completedAt: serverTimestamp() as unknown as Timestamp,
  });
}

/**
 * Mark a processing job as errored.
 */
export async function failProcessingJob(
  songId: string,
  jobId: string,
  errorMessage: string
): Promise<void> {
  await updateProcessingJob(songId, jobId, {
    status: 'error',
    errorMessage,
    completedAt: serverTimestamp() as unknown as Timestamp,
  });
}

/**
 * Restart a failed processing job.
 * Resets status to 'queued', clears progress and error, and resets timestamps. * Also resets the parent song status to'queued'.
 */
export async function restartProcessingJob(
  songId: string,
  jobId: string
): Promise<void> {
  await updateDoc(
    doc(db, COLLECTIONS.SONGS, songId, COLLECTIONS.PROCESSING_JOBS, jobId),
    {
      status: 'queued',
      progress: 0,
      errorMessage: deleteField(),
      startedAt: null,
      completedAt: null,
    }
  );
  await updateSongStatus(songId, 'queued');
}
