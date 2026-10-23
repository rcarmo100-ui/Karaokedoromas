'use client';

/**
 * Player para músicas separadas no PC (Fase 2).
 * Toca o instrumental salvo no aparelho e, junto, a voz original como
 * "voz guia" com volume ajustável (0 = só instrumental). Funciona offline.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, Mic } from 'lucide-react';
import { repositoryGetAudioUrl } from '@/lib/songRepository';

interface Props {
  localId: string;
  /** Muda a cada nova reprodução para recomeçar do zero */
  playKey: string;
  title: string;
  initialGuideLevel?: number;
  onEnded?: () => void;
  onTime?: (seconds: number) => void;
  onError?: (message: string) => void;
  onGuideLevelChange?: (level: number) => void;
  className?: string;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function LocalKaraokePlayer({
  localId,
  playKey,
  title,
  initialGuideLevel = 0,
  onEnded,
  onTime,
  onError,
  onGuideLevelChange,
  className,
}: Props) {
  const instRef = useRef<HTMLAudioElement | null>(null);
  const vocalRef = useRef<HTMLAudioElement | null>(null);
  const [hasVocal, setHasVocal] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [guide, setGuide] = useState(initialGuideLevel);

  const cbRef = useRef({ onEnded, onTime, onError });
  cbRef.current = { onEnded, onTime, onError };

  // Carrega os arquivos do aparelho
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    setReady(false);
    setPlaying(false);
    setTime(0);
    setGuide(initialGuideLevel);

    (async () => {
      const instUrl = await repositoryGetAudioUrl(localId, 'instrumental');
      const vocalUrl = await repositoryGetAudioUrl(localId, 'vocals');
      if (cancelled) {
        [instUrl, vocalUrl].forEach((u) => u && URL.revokeObjectURL(u));
        return;
      }
      if (!instUrl) {
        cbRef.current.onError?.('O instrumental desta música não está salvo neste aparelho.');
        return;
      }
      urls.push(instUrl);
      const inst = new Audio(instUrl);
      inst.preload = 'auto';
      instRef.current = inst;

      if (vocalUrl) {
        urls.push(vocalUrl);
        const vocal = new Audio(vocalUrl);
        vocal.preload = 'auto';
        vocalRef.current = vocal;
        setHasVocal(true);
      } else {
        vocalRef.current = null;
        setHasVocal(false);
      }

      inst.addEventListener('loadedmetadata', () => setDuration(inst.duration));
      inst.addEventListener('timeupdate', () => {
        setTime(inst.currentTime);
        cbRef.current.onTime?.(inst.currentTime);
        // Corrige a voz guia se descompassar
        const v = vocalRef.current;
        if (v && !inst.paused && Math.abs(v.currentTime - inst.currentTime) > 0.15) {
          v.currentTime = inst.currentTime;
        }
      });
      inst.addEventListener('play', () => setPlaying(true));
      inst.addEventListener('pause', () => setPlaying(false));
      inst.addEventListener('ended', () => {
        vocalRef.current?.pause();
        setPlaying(false);
        cbRef.current.onEnded?.();
      });
      inst.addEventListener('error', () => cbRef.current.onError?.('Não consegui tocar o arquivo salvo.'));

      setReady(true);
      // Tenta começar sozinho (o navegador pode exigir um toque)
      inst.play().then(() => vocalRef.current?.play().catch(() => {})).catch(() => {});
    })().catch(() => cbRef.current.onError?.('Não consegui abrir a música salva.'));

    return () => {
      cancelled = true;
      instRef.current?.pause();
      vocalRef.current?.pause();
      instRef.current = null;
      vocalRef.current = null;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId, playKey]);

  // Volumes
  useEffect(() => {
    if (instRef.current) instRef.current.volume = volume / 100;
    if (vocalRef.current) vocalRef.current.volume = (volume / 100) * (guide / 100);
  }, [volume, guide, ready]);

  const toggle = useCallback(() => {
    const inst = instRef.current;
    if (!inst) return;
    if (inst.paused) {
      inst.play().catch(() => cbRef.current.onError?.('Toque de novo para tocar.'));
      const v = vocalRef.current;
      if (v) {
        v.currentTime = inst.currentTime;
        v.play().catch(() => {});
      }
    } else {
      inst.pause();
      vocalRef.current?.pause();
    }
  }, []);

  const seek = (value: number) => {
    if (instRef.current) instRef.current.currentTime = value;
    if (vocalRef.current) vocalRef.current.currentTime = value;
    setTime(value);
  };

  const changeGuide = (value: number) => {
    setGuide(value);
    onGuideLevelChange?.(value);
  };

  return (
    <div className={className}>
      <div className="w-full h-full flex flex-col items-center justify-center gap-5 px-6 bg-gradient-to-br from-primary/20 via-black to-accent/20">
        <p className="text-lg sm:text-2xl font-bold text-center line-clamp-2">{title}</p>

        <button
          onClick={toggle}
          disabled={!ready}
          className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
          aria-label={playing ? 'Pausar' : 'Tocar'}
        >
          {playing ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" className="ml-1" />}
        </button>

        <div className="w-full max-w-lg">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.5}
            value={Math.min(time, duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="Posição da música"
          />
          <div className="flex justify-between text-xs text-muted-foreground font-mono-nums">
            <span>{fmt(time)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            <Volume2 size={14} />
            <span className="w-14">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
          </label>
          {hasVocal && (
            <label className="flex items-center gap-2" title="Volume da voz original, para ajudar quem não sabe a música">
              <Mic size={14} />
              <span className="w-14">Voz guia</span>
              <input
                type="range"
                min={0}
                max={100}
                value={guide}
                onChange={(e) => changeGuide(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
