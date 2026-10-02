/**
 * ════════════════════════════════════════════════════════════════════════════
 * LOCAL PROCESSING QUEUE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Architecture for local audio processing.
 *
 * States: QUEUED → PROCESSING → DONE | ERROR
 *
 * IMPORTANT:
 *   Vocal separation is NOT yet implemented locally.
 *   This file creates the architecture and documents what is pending.
 *
 * Status:
 *   - audio_preparation: ARCHITECTURE READY (actual processing: PENDING)
 *   - vocal_separation: ARCHITECTURE READY (model/worker: PENDING)
 *   - instrumental_generation: ARCHITECTURE READY (depends on vocal_separation)
 *   - lyrics_preparation: ARCHITECTURE READY (LRC parser: PARTIAL)
 *   - finalization: ARCHITECTURE READY
 *
 * CHECKPOINT_2_PROCESSAMENTO_LOCAL
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  localProcessingJobCreate,
  localProcessingJobUpdate,
  localProcessingJobsForSong,
  localUpdateSong,
  type LocalProcessingJob,
} from './localDB';

export type { LocalProcessingJob };

// ── Queue management ──────────────────────────────────────────────────────────

/**
 * Queue a song for local processing.
 * Creates processing job records for each step.
 * Actual processing must be triggered separately.
 */
export async function queueSongForProcessing(songId: string): Promise<string[]> {
  const steps: LocalProcessingJob['step'][] = [
    'audio_preparation',
    'vocal_separation',
    'instrumental_generation',
    'lyrics_preparation',
    'finalization',
  ];

  const jobIds: string[] = [];
  for (const step of steps) {
    const id = await localProcessingJobCreate(songId, step);
    jobIds.push(id);
  }

  await localUpdateSong(songId, { processingStatus: 'QUEUED' });
  return jobIds;
}

/**
 * Get all processing jobs for a song.
 */
export async function getProcessingJobsForSong(songId: string): Promise<LocalProcessingJob[]> {
  return localProcessingJobsForSong(songId);
}

/**
 * Mark the audio_preparation step as done (audio file is stored locally).
 * This is the only step that can be automatically completed when a file is uploaded.
 */
export async function markAudioPreparationDone(songId: string, jobId: string): Promise<void> {
  await localProcessingJobUpdate(jobId, {
    status: 'DONE',
    progress: 100,
    updatedAt: Date.now(),
  });
  await localUpdateSong(songId, { processingStatus: 'QUEUED' });
}

/**
 * Mark a processing job as failed.
 * CRITICAL: Never deletes local audio data on error.
 */
export async function markProcessingJobError(
  songId: string,
  jobId: string,
  errorMessage: string
): Promise<void> {
  await localProcessingJobUpdate(jobId, {
    status: 'ERROR',
    errorMessage,
    updatedAt: Date.now(),
  });
  await localUpdateSong(songId, {
    processingStatus: 'ERROR',
    processingError: errorMessage,
  });
}

/**
 * Get a human-readable status summary for a song's processing.
 *
 * NOTE ON VOCAL SEPARATION:
 * The vocal separation step requires a local ML model (e.g., Demucs/UVR).
 * This is NOT yet implemented. The architecture is in place but the actual
 * worker/model integration is PENDING.
 *
 * To implement vocal separation locally, you would need:
 * 1. A Web Worker that loads a WASM-compiled Demucs model
 * 2. Or a local Python server running Demucs/UVR
 * 3. Communication via postMessage or HTTP to the worker
 *
 * Until then, songs added locally will have:
 *   - audio_preparation: DONE (file stored)
 *   - vocal_separation: QUEUED (waiting for worker)
 *   - instrumental_generation: QUEUED
 *   - lyrics_preparation: QUEUED
 *   - finalization: QUEUED
 */
export function getProcessingStatusLabel(status: LocalProcessingJob['status']): string {
  const map: Record<LocalProcessingJob['status'], string> = {
    QUEUED: 'Aguardando',
    PROCESSING: 'Processando',
    DONE: 'Concluído',
    ERROR: 'Erro',
  };
  return map[status] ?? status;
}

export function getProcessingStepLabel(step: LocalProcessingJob['step']): string {
  const map: Record<LocalProcessingJob['step'], string> = {
    audio_preparation: 'Preparação do áudio',
    vocal_separation: 'Separação vocal (IA)',
    instrumental_generation: 'Geração do instrumental',
    lyrics_preparation: 'Preparação das letras',
    finalization: 'Finalização',
  };
  return map[step] ?? step;
}
