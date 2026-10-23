/**
 * Fila de karaokê (YouTube) — "tocando agora" + próximas.
 * Fica salva no aparelho (localStorage), então sobrevive a recarregar a página.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { YouTubeTrack } from '@/lib/youtube';

export interface KaraokeQueueItem {
  queueId: string;
  track: YouTubeTrack;
  /** Quem vai cantar (opcional, útil em festa) */
  singer?: string;
  /** Id da música na biblioteca, se veio das favoritas */
  localId?: string;
}

interface QueueState {
  nowPlaying: KaraokeQueueItem | null;
  upcoming: KaraokeQueueItem[];
}

const STORAGE_KEY = 'karaoke-youtube-queue:v1';
const EMPTY: QueueState = { nowPlaying: null, upcoming: [] };

function newQueueId(): string {
  return `kq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadState(): QueueState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as QueueState;
    if (!parsed || !Array.isArray(parsed.upcoming)) return EMPTY;
    return { nowPlaying: parsed.nowPlaying ?? null, upcoming: parsed.upcoming };
  } catch {
    return EMPTY;
  }
}

export function useKaraokeQueue() {
  const [state, setState] = useState<QueueState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const firstSave = useRef(true);

  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // armazenamento cheio ou bloqueado: a fila segue funcionando na memória
    }
  }, [state, loaded]);

  /** Coloca no fim da fila. Se nada estiver tocando, já começa. */
  const enqueue = useCallback((track: YouTubeTrack, extra: { singer?: string; localId?: string } = {}) => {
    const item: KaraokeQueueItem = { queueId: newQueueId(), track, ...extra };
    setState((s) => (s.nowPlaying ? { ...s, upcoming: [...s.upcoming, item] } : { ...s, nowPlaying: item }));
  }, []);

  /** Toca agora, sem mexer no restante da fila. */
  const playNow = useCallback((track: YouTubeTrack, extra: { singer?: string; localId?: string } = {}) => {
    const item: KaraokeQueueItem = { queueId: newQueueId(), track, ...extra };
    setState((s) => ({ ...s, nowPlaying: item }));
  }, []);

  /** Passa para a próxima da fila (ou para quando acabar). */
  const next = useCallback(() => {
    setState((s) => {
      const [first, ...rest] = s.upcoming;
      return { nowPlaying: first ?? null, upcoming: rest };
    });
  }, []);

  /** Tira um item da fila e toca agora. */
  const playFromQueue = useCallback((queueId: string) => {
    setState((s) => {
      const item = s.upcoming.find((i) => i.queueId === queueId);
      if (!item) return s;
      return { nowPlaying: item, upcoming: s.upcoming.filter((i) => i.queueId !== queueId) };
    });
  }, []);

  const remove = useCallback((queueId: string) => {
    setState((s) => ({ ...s, upcoming: s.upcoming.filter((i) => i.queueId !== queueId) }));
  }, []);

  const move = useCallback((queueId: string, delta: -1 | 1) => {
    setState((s) => {
      const idx = s.upcoming.findIndex((i) => i.queueId === queueId);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= s.upcoming.length) return s;
      const upcoming = [...s.upcoming];
      [upcoming[idx], upcoming[target]] = [upcoming[target], upcoming[idx]];
      return { ...s, upcoming };
    });
  }, []);

  /** Repete a música atual (novo id para o player recarregar). */
  const replay = useCallback(() => {
    setState((s) => (s.nowPlaying ? { ...s, nowPlaying: { ...s.nowPlaying, queueId: newQueueId() } } : s));
  }, []);

  const stop = useCallback(() => setState((s) => ({ ...s, nowPlaying: null })), []);
  const clearUpcoming = useCallback(() => setState((s) => ({ ...s, upcoming: [] })), []);

  return {
    loaded,
    nowPlaying: state.nowPlaying,
    upcoming: state.upcoming,
    enqueue,
    playNow,
    next,
    playFromQueue,
    remove,
    moveUp: (id: string) => move(id, -1),
    moveDown: (id: string) => move(id, 1),
    replay,
    stop,
    clearUpcoming,
  };
}
