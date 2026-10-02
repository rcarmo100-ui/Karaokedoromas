/**
 * ════════════════════════════════════════════════════════════════════════════
 * LOCAL LIBRARY HOOK — React hook for local song library
 * ════════════════════════════════════════════════════════════════════════════
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  repositoryGetAllSongs,
  repositoryGetRecentSongs,
  repositoryDeleteSongLocally,
  type LocalSong,
} from '@/lib/songRepository';

export function useLocalLibrary() {
  const [songs, setSongs] = useState<LocalSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSongs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await repositoryGetAllSongs();
      setSongs(data);
    } catch (err) {
      console.error('[useLocalLibrary] Failed to load songs:', err);
      setError('Não foi possível carregar a biblioteca local.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  const deleteSong = useCallback(async (id: string) => {
    await repositoryDeleteSongLocally(id);
    setSongs((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { songs, loading, error, reload: loadSongs, deleteSong };
}

export function useLocalRecentSongs(limit = 5) {
  const [songs, setSongs] = useState<LocalSong[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    repositoryGetRecentSongs(limit)
      .then(setSongs)
      .catch((err) => console.error('[useLocalRecentSongs]', err))
      .finally(() => setLoading(false));
  }, [limit]);

  return { songs, loading };
}
