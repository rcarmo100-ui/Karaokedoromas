/**
 * ════════════════════════════════════════════════════════════════════════════
 * OFFLINE SONG QUEUE — Local-first song queue
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The queue works entirely offline using local state.
 * No Firebase dependency.
 *
 * CHECKPOINT_3_PLAYER_LOCAL
 * ════════════════════════════════════════════════════════════════════════════
 */
'use client';

import { useState, useCallback } from 'react';
import type { LocalSong } from '@/lib/songRepository';

export interface QueueItem {
  queueId: string;
  song: LocalSong;
}

let queueIdCounter = 0;
function nextQueueId(): string {
  return `q-${++queueIdCounter}-${Date.now()}`;
}

export function useSongQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  const currentItem = currentIndex >= 0 && currentIndex < queue.length
    ? queue[currentIndex]
    : null;

  const addToQueue = useCallback((song: LocalSong) => {
    setQueue((prev) => [...prev, { queueId: nextQueueId(), song }]);
  }, []);

  const removeFromQueue = useCallback((queueId: string) => {
    setQueue((prev) => {
      const idx = prev.findIndex((item) => item.queueId === queueId);
      if (idx === -1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      // Adjust current index if needed
      setCurrentIndex((ci) => {
        if (ci > idx) return ci - 1;
        if (ci === idx) return Math.min(ci, next.length - 1);
        return ci;
      });
      return next;
    });
  }, []);

  const playNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (queue.length === 0) return -1;
      return Math.min(prev + 1, queue.length - 1);
    });
  }, [queue.length]);

  const playPrevious = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const playAt = useCallback((index: number) => {
    if (index >= 0 && index < queue.length) {
      setCurrentIndex(index);
    }
  }, [queue.length]);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setCurrentIndex(-1);
  }, []);

  const moveUp = useCallback((queueId: string) => {
    setQueue((prev) => {
      const idx = prev.findIndex((item) => item.queueId === queueId);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((queueId: string) => {
    setQueue((prev) => {
      const idx = prev.findIndex((item) => item.queueId === queueId);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  return {
    queue,
    currentIndex,
    currentItem,
    addToQueue,
    removeFromQueue,
    playNext,
    playPrevious,
    playAt,
    clearQueue,
    moveUp,
    moveDown,
    hasNext: currentIndex < queue.length - 1,
    hasPrevious: currentIndex > 0,
  };
}
