/**
 * ════════════════════════════════════════════════════════════════════════════
 * AUDIO INTEGRATION SCAFFOLDING — Etapa futura
 * ════════════════════════════════════════════════════════════════════════════
 *
 * This file is a structural placeholder for future audio features.
 * Nothing here is implemented yet — it defines the contracts (interfaces,
 * enums, and stub functions) that will be filled in a later stage.
 *
 * Planned integrations:
 *  1. YouTube audio extraction  — yt-dlp / server-side API route
 *  2. Vocal separation          — Demucs / UVR via Python microservice or
 *                                  a cloud function (e.g. Replicate API)
 *  3. Real audio playback       — HTMLAudioElement or Web Audio API
 *  4. Lyrics synchronisation    — LRC file parsing + timestamp alignment
 * ════════════════════════════════════════════════════════════════════════════
 */

// ── 1. Audio source types ────────────────────────────────────────────────────

export type AudioSourceType = 'youtube' | 'upload' | 'demo';

export interface AudioSource {
  type: AudioSourceType;
  /** Raw YouTube URL or uploaded file path */
  rawUrl: string;
  /** Extracted audio URL (populated after server-side processing) */
  audioUrl?: string;
  /** Vocal-only track URL (populated after vocal separation) */
  vocalUrl?: string;
  /** Instrumental-only track URL (populated after vocal separation) */
  instrumentalUrl?: string;
}

// ── 2. Vocal separation job ──────────────────────────────────────────────────

export type VocalSeparationStatus =
  | 'idle' |'queued' |'processing' |'done' |'error';

export interface VocalSeparationJob {
  jobId: string;
  songId: string;
  status: VocalSeparationStatus;
  progress: number; // 0–100
  errorMessage?: string;
  /** URLs set when status === 'done' */
  result?: {
    vocalUrl: string;
    instrumentalUrl: string;
  };
}

// ── 3. Player state contract ─────────────────────────────────────────────────

export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;   // seconds
  duration: number;      // seconds
  volume: number;        // 0–100
  isMuted: boolean;
  isLoading: boolean;
  error: string | null;
}

// ── 4. Stub: YouTube audio extraction ────────────────────────────────────────
// FUTURE: Call a Next.js API route (e.g. POST /api/audio/extract) that runs
// yt-dlp on the server and returns a signed storage URL.

export async function extractAudioFromYouTube(
  _youtubeUrl: string,
  _songId: string
): Promise<{ audioUrl: string }> {
  // TODO (Etapa futura): implement server-side extraction
  throw new Error('extractAudioFromYouTube: not yet implemented');
}

// ── 5. Stub: Vocal separation ─────────────────────────────────────────────────
// FUTURE: Submit a job to a Demucs/UVR microservice or Replicate API.
// Poll VocalSeparationJob.status until 'done', then update the song record.

export async function startVocalSeparation(
  _audioUrl: string,
  _songId: string
): Promise<VocalSeparationJob> {
  // TODO (Etapa futura): implement vocal separation job submission
  throw new Error('startVocalSeparation: not yet implemented');
}

export async function getVocalSeparationStatus(
  _jobId: string
): Promise<VocalSeparationJob> {
  // TODO (Etapa futura): poll job status from backend
  throw new Error('getVocalSeparationStatus: not yet implemented');
}

// ── 6. Stub: Real audio player hook ──────────────────────────────────────────
// FUTURE: Replace the mock setInterval timer in KaraokePlayerClient with this
// hook. It wraps HTMLAudioElement and exposes the AudioPlayerState interface.
//
// Usage (future):
//   const player = useAudioPlayer(song.audioSource?.audioUrl ?? '');
//   // then bind player.isPlaying, player.currentTime, etc. to the UI

export function useAudioPlayer(
  _src: string
): AudioPlayerState {
  // TODO (Etapa futura): implement real HTMLAudioElement-based hook
  // For now, return a safe default so imports don't break
  return {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 80,
    isMuted: false,
    isLoading: false,
    error: null,
  };
}

// ── 7. Stub: LRC lyrics parser ────────────────────────────────────────────────
// FUTURE: Parse .lrc files (timestamped lyrics) into the demoLyrics format
// already used by KaraokePlayerClient.
//
// LRC line format: [mm:ss.xx] lyric text

export interface TimedLyric {
  id: string;
  text: string;
  time: number; // seconds
}

export function parseLrcFile(_lrcContent: string): TimedLyric[] {
  // TODO (Etapa futura): implement LRC parser
  return [];
}
