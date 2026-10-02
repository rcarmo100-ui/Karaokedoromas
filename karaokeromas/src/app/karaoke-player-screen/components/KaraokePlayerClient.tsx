'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ArrowLeft,
  Music2,
  Mic2,
  Info,
  ChevronUp,
  ChevronDown,
  HardDrive,
} from 'lucide-react';
import { mockSongs, demoLyrics } from '@/lib/songStore';
import { getSong } from '@/lib/firestoreService';
import type { SongDocument } from '@/lib/firestoreService';
import { repositoryGetSong, repositoryGetAudioUrl } from '@/lib/songRepository';
import type { LocalSong } from '@/lib/songRepository';
import { useSearchParams } from 'next/navigation';

const defaultSong = mockSongs[0];
const TOTAL_DURATION = 240;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const PLAYER_HIDE_DELAY = 5000;

export default function KaraokePlayerClient() {
  const searchParams = useSearchParams();
  const songIdParam = searchParams.get('songId');
  const localIdParam = searchParams.get('localId');

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeLyricIndex, setActiveLyricIndex] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [firestoreSong, setFirestoreSong] = useState<SongDocument | null>(null);
  const [localSong, setLocalSong] = useState<LocalSong | null>(null);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);

  const [playerVisible, setPlayerVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLyricRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load local song if localId is provided
  useEffect(() => {
    if (!localIdParam) return;
    repositoryGetSong(localIdParam)
      .then(async (song) => {
        if (song) {
          setLocalSong(song);
          // Try to get local audio URL
          const url = await repositoryGetAudioUrl(localIdParam, 'original');
          if (url) setLocalAudioUrl(url);
        }
      })
      .catch((err) => {
        console.error('[KaraokePlayerClient] Failed to load local song:', err);
      });
  }, [localIdParam]);

  // Load Firestore song if songId is provided (and no local song)
  useEffect(() => {
    if (!songIdParam || localIdParam) return;
    getSong(songIdParam)
      .then((song) => {
        if (song) setFirestoreSong(song);
      })
      .catch((err) => {
        console.error('[KaraokePlayerClient] Failed to load song from Firestore:', err);
      });
  }, [songIdParam, localIdParam]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    };
  }, [localAudioUrl]);

  // Determine current song for display
  const currentSong = localSong
    ? {
        id: localSong.id,
        title: localSong.title,
        artist: localSong.artist,
        genre: localSong.genre,
        youtubeUrl: localSong.youtubeUrl,
        addedAt: '',
        status: localSong.processingStatus === 'DONE' ? 'ready' as const : 'processing' as const,
        duration: localSong.duration,
        coverColor: localSong.coverColor || '#a855f7',
        isLocal: true,
      }
    : firestoreSong
    ? {
        id: firestoreSong.id ?? songIdParam ?? 'unknown',
        title: firestoreSong.title,
        artist: firestoreSong.artist,
        genre: firestoreSong.genre,
        youtubeUrl: firestoreSong.youtubeUrl,
        addedAt: '',
        status: firestoreSong.status as 'processing' | 'ready' | 'demo',
        duration: firestoreSong.duration,
        coverColor: firestoreSong.coverColor || '#a855f7',
        isLocal: false,
      }
    : {
        ...(mockSongs[currentSongIndex] || defaultSong),
        isLocal: false,
      };

  const hasLocalAudio = Boolean(localAudioUrl);
  const hasRealAudio = Boolean(
    firestoreSong?.status === 'ready' && firestoreSong?.instrumentalAudioPath
  );

  // ── Auto-hide logic ────────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setPlayerVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (!isFullscreen) {
      hideTimerRef.current = setTimeout(() => {
        setPlayerVisible(false);
      }, PLAYER_HIDE_DELAY);
    }
  }, [isFullscreen]);

  const handleUserActivity = useCallback(() => {
    resetHideTimer();
  }, [resetHideTimer]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [resetHideTimer]);

  useEffect(() => {
    if (isFullscreen) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setPlayerVisible(false);
    } else {
      resetHideTimer();
    }
  }, [isFullscreen, resetHideTimer]);

  // ── Real audio playback (when local audio is available) ───────────────────
  useEffect(() => {
    if (!localAudioUrl) return;

    const audio = new Audio(localAudioUrl);
    audio.volume = isMuted ? 0 : volume / 100;
    audioRef.current = audio;

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localAudioUrl]);

  // ── Playback timer (mock — used when no real audio) ────────────────────────
  useEffect(() => {
    if (hasLocalAudio) return; // Real audio handles its own timing

    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= TOTAL_DURATION) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.5;
        });
      }, 500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, hasLocalAudio]);

  // Sync volume to real audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  // Update active lyric based on current time
  useEffect(() => {
    let activeIdx = 0;
    for (let i = 0; i < demoLyrics.length; i++) {
      if (currentTime >= demoLyrics[i].time) {
        activeIdx = i;
      }
    }
    setActiveLyricIndex(activeIdx);
  }, [currentTime]);

  // Scroll active lyric into view
  useEffect(() => {
    if (activeLyricRef.current && lyricsContainerRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLyricIndex]);

  const handlePlayPause = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch((err) => {
          console.error('[KaraokePlayerClient] Audio play error:', err);
        });
      }
    }
    setIsPlaying((prev) => !prev);
    handleUserActivity();
  }, [isPlaying, handleUserActivity]);

  const handleSkipBack = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    setCurrentTime(0);
    setIsPlaying(false);
    handleUserActivity();
  }, [handleUserActivity]);

  const handleSkipForward = useCallback(() => {
    const nextIndex = (currentSongIndex + 1) % mockSongs.length;
    setCurrentSongIndex(nextIndex);
    setCurrentTime(0);
    setIsPlaying(false);
    handleUserActivity();
  }, [currentSongIndex, handleUserActivity]);

  const handlePrevSong = useCallback(() => {
    const prevIndex = (currentSongIndex - 1 + mockSongs.length) % mockSongs.length;
    setCurrentSongIndex(prevIndex);
    setCurrentTime(0);
    setIsPlaying(false);
    handleUserActivity();
  }, [currentSongIndex, handleUserActivity]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const duration = audioRef.current?.duration || TOTAL_DURATION;
    const newTime = Math.floor(ratio * duration);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setCurrentTime(newTime);
    handleUserActivity();
  }, [handleUserActivity]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (val > 0 && isMuted) setIsMuted(false);
    handleUserActivity();
  }, [isMuted, handleUserActivity]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted((prev) => !prev);
    handleUserActivity();
  }, [handleUserActivity]);

  const audioDuration = audioRef.current?.duration || TOTAL_DURATION;
  const progressPercent = (currentTime / audioDuration) * 100;
  const effectiveVolume = isMuted ? 0 : volume;
  const genreColor = currentSong.coverColor || '#a855f7';

  return (
    <div
      className="min-h-[calc(100vh-64px)] flex flex-col relative overflow-hidden"
      onClick={handleUserActivity}
      onTouchStart={handleUserActivity}
      onMouseMove={handleUserActivity}
    >
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-8 rounded-full"
          style={{ background: `radial-gradient(ellipse, ${genreColor}22 0%, transparent 70%)` }}
        />
      </div>

      {/* Top bar — hidden in fullscreen */}
      {!isFullscreen && (
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 relative z-10">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Biblioteca</span>
          </Link>

          <div className="flex items-center gap-2">
            {/* Local audio indicator */}
            {hasLocalAudio && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/25 text-xs text-green-400">
                <HardDrive size={11} />
                <span>Local</span>
              </div>
            )}

            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150"
              aria-label="Informações da música"
            >
              <Info size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Song info panel */}
      {showInfo && !isFullscreen && (
        <div className="mx-4 sm:mx-6 mb-4 p-4 bg-card-elevated rounded-2xl border border-border relative z-10">
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-extrabold flex-shrink-0"
              style={{ background: `${genreColor}33`, color: genreColor }}
            >
              {currentSong.title.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{currentSong.title}</p>
              <p className="text-sm text-muted-foreground">{currentSong.artist}</p>
              <p className="text-xs text-muted-foreground mt-1">{currentSong.genre}</p>
              {'isLocal' in currentSong && currentSong.isLocal && (
                <div className="flex items-center gap-1 mt-1">
                  <HardDrive size={10} className="text-green-400" />
                  <span className="text-xs text-green-400">Armazenado localmente</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lyrics area */}
      <div
        className={`flex-1 flex flex-col items-center justify-center px-4 sm:px-8 relative ${
          isFullscreen ? 'py-8' : 'py-4'
        }`}
      >
        <div
          ref={lyricsContainerRef}
          className={`w-full max-w-2xl overflow-y-auto scrollbar-hide space-y-3 ${
            isFullscreen ? 'max-h-[calc(100vh-120px)]' : 'max-h-[40vh] sm:max-h-[50vh]'
          }`}
        >
          {demoLyrics.map((lyric, index) => {
            const isActive = index === activeLyricIndex;
            const isPast = index < activeLyricIndex;
            return (
              <div
                key={lyric.id}
                ref={isActive ? activeLyricRef : null}
                className={`text-center transition-all duration-300 px-4 py-2 rounded-xl ${
                  isActive
                    ? 'text-white text-2xl sm:text-3xl font-bold scale-105'
                    : isPast
                    ? 'text-muted-foreground/40 text-lg sm:text-xl'
                    : 'text-muted-foreground/60 text-lg sm:text-xl'
                }`}
                style={isActive ? { color: genreColor, textShadow: `0 0 20px ${genreColor}66` } : {}}
              >
                {lyric.text}
              </div>
            );
          })}
        </div>

        {/* Fullscreen toggle */}
        <button
          onClick={() => { setIsFullscreen((prev) => !prev); handleUserActivity(); }}
          className="absolute bottom-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150"
          aria-label={isFullscreen ? 'Sair do modo tela cheia' : 'Modo tela cheia'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {/* Player controls */}
      <div
        className={`transition-all duration-500 ${
          playerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
        }`}
      >
        <div className="mx-4 sm:mx-6 mb-6 p-4 sm:p-5 bg-card-elevated/90 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl">
          {/* Song title + artist */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-extrabold flex-shrink-0"
              style={{ background: `${genreColor}33`, color: genreColor }}
            >
              {currentSong.title.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{currentSong.title}</p>
              <p className="text-xs text-muted-foreground truncate">{currentSong.artist}</p>
            </div>
            {/* Audio mode indicator */}
            <div className="flex-shrink-0">
              {hasLocalAudio ? (
                <div className="flex items-center gap-1 text-xs text-green-400">
                  <HardDrive size={11} />
                  <span className="hidden sm:inline">Local</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Music2 size={11} />
                  <span className="hidden sm:inline">Demo</span>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div
            className="relative h-2 bg-muted/40 rounded-full cursor-pointer mb-3 group"
            onClick={handleProgressClick}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all duration-100"
              style={{ width: `${progressPercent}%`, background: genreColor }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            />
          </div>

          {/* Time */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
            <span className="font-mono-nums">{formatTime(currentTime)}</span>
            <span className="font-mono-nums">{formatTime(audioDuration)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            {/* Volume */}
            <div className="flex items-center gap-2 flex-1">
              <button
                onClick={handleMuteToggle}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors duration-150"
                aria-label={isMuted ? 'Ativar som' : 'Silenciar'}
              >
                {effectiveVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={effectiveVolume}
                onChange={handleVolumeChange}
                className="w-16 sm:w-24 h-1 accent-primary cursor-pointer"
                aria-label="Volume"
              />
            </div>

            {/* Playback controls */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={handlePrevSong}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 active:scale-90"
                aria-label="Música anterior"
              >
                <ChevronDown size={20} />
              </button>
              <button
                onClick={handleSkipBack}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 active:scale-90"
                aria-label="Reiniciar"
              >
                <SkipBack size={20} />
              </button>
              <button
                onClick={handlePlayPause}
                className="w-12 h-12 rounded-full flex items-center justify-center text-white transition-all duration-150 hover:scale-105 active:scale-95 shadow-lg"
                style={{ background: genreColor }}
                aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" className="ml-0.5" />}
              </button>
              <button
                onClick={handleSkipForward}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 active:scale-90"
                aria-label="Próxima música"
              >
                <SkipForward size={20} />
              </button>
              <button
                onClick={handleSkipForward}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 active:scale-90"
                aria-label="Próxima"
              >
                <ChevronUp size={20} />
              </button>
            </div>

            {/* Right side spacer */}
            <div className="flex-1 flex justify-end">
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150"
                aria-label="Info"
              >
                <Mic2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tap to show player hint */}
      {!playerVisible && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur-sm rounded-full text-xs text-white/60 pointer-events-none">
          Toque para mostrar os controles
        </div>
      )}
    </div>
  );
}