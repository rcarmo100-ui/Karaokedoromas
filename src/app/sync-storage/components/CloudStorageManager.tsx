'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Cloud,
  Trash2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { repositoryGetAllSongs, type LocalSong } from '@/lib/songRepository';
import { localGetSongStorageBytes, localGetTotalStorageBytes } from '@/lib/localDB';
import { getRecentSongs, deleteSong as deleteCloudSong } from '@/lib/firestoreService';
import { deleteSongFiles } from '@/lib/storageService';
import { useConnectivity } from '@/hooks/useConnectivity';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface SongWithSize {
  song: LocalSong;
  localBytes: number;
  isInCloud: boolean;
}

export default function CloudStorageManager() {
  const { isOnline } = useConnectivity();
  const [songs, setSongs] = useState<SongWithSize[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalLocalBytes, setTotalLocalBytes] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const localSongs = await repositoryGetAllSongs();
      const totalBytes = await localGetTotalStorageBytes();
      setTotalLocalBytes(totalBytes);

      // Get cloud songs to check which are synced
      let cloudIds = new Set<string>();
      if (isOnline) {
        try {
          const cloudSongs = await getRecentSongs(200);
          cloudIds = new Set(cloudSongs.map((s) => s.id).filter(Boolean) as string[]);
        } catch { /* offline or error — ignore */ }
      }

      const withSizes: SongWithSize[] = await Promise.all(
        localSongs.map(async (song) => {
          const localBytes = await localGetSongStorageBytes(song.id);
          const isInCloud = song.cloudSongId ? cloudIds.has(song.cloudSongId) : false;
          return { song, localBytes, isInCloud };
        })
      );

      setSongs(withSizes);
    } catch (err) {
      console.error('[CloudStorageManager] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteFromCloud = useCallback(async (item: SongWithSize) => {
    if (!item.song.cloudSongId) return;

    const confirmed = window.confirm(
      `⚠️ CONFIRMAR EXCLUSÃO DA NUVEM\n\n` +
      `Música: ${item.song.title}\n` +
      `Artista: ${item.song.artist}\n\n` +
      `Esta ação removerá a música do Firebase (Firestore + Storage).\n` +
      `O arquivo LOCAL será PRESERVADO.\n\n` +
      `Deseja continuar?`
    );

    if (!confirmed) return;

    setDeletingId(item.song.id);
    setDeleteResult(null);

    try {
      // Delete from Firestore
      await deleteCloudSong(item.song.cloudSongId);
      // Delete from Storage
      await deleteSongFiles(item.song.cloudSongId).catch(() => {});

      // Update local record — mark as LOCAL_ONLY, clear cloudSongId
      const { repositoryUpdateSong } = await import('@/lib/songRepository');
      await repositoryUpdateSong(item.song.id, {
        syncStatus: 'LOCAL_ONLY',
        cloudSongId: undefined,
        localOnly: true,
      });

      setDeleteResult(`"${item.song.title}" removida da nuvem. Arquivo local preservado.`);
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDeleteResult(`Erro ao remover da nuvem: ${msg}. Arquivo local preservado.`);
    } finally {
      setDeletingId(null);
    }
  }, [loadData]);

  const syncedSongs = songs.filter((s) => s.isInCloud);
  const localOnlySongs = songs.filter((s) => !s.isInCloud);

  return (
    <div className="bg-card-elevated rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <HardDrive size={18} className="text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Gerenciador de Armazenamento</h3>
            <p className="text-xs text-muted-foreground">Local e nuvem</p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 disabled:opacity-50"
          aria-label="Recarregar"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Storage summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-muted/20 rounded-xl text-center">
          <p className="text-lg font-bold text-foreground">{songs.length}</p>
          <p className="text-xs text-muted-foreground">Total local</p>
        </div>
        <div className="p-3 bg-blue-500/10 rounded-xl text-center">
          <p className="text-lg font-bold text-blue-400">{syncedSongs.length}</p>
          <p className="text-xs text-muted-foreground">Na nuvem</p>
        </div>
        <div className="p-3 bg-muted/20 rounded-xl text-center">
          <p className="text-sm font-bold text-foreground">{formatBytes(totalLocalBytes)}</p>
          <p className="text-xs text-muted-foreground">Armazenamento local</p>
        </div>
      </div>

      {/* Delete result */}
      {deleteResult && (
        <div className={`flex items-start gap-2 p-3 rounded-xl border ${
          deleteResult.startsWith('Erro')
            ? 'bg-red-500/10 border-red-500/20' :'bg-green-500/10 border-green-500/20'
        }`}>
          {deleteResult.startsWith('Erro') ? (
            <AlertTriangle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
          ) : (
            <CheckCircle2 size={13} className="text-green-400 mt-0.5 flex-shrink-0" />
          )}
          <p className="text-xs text-foreground">{deleteResult}</p>
        </div>
      )}

      {/* Critical rule notice */}
      <div className="flex items-start gap-2 p-3 bg-blue-500/8 border border-blue-500/15 rounded-xl">
        <Info size={13} className="text-blue-400/80 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-300/70">
          <strong>Regra de segurança:</strong> Excluir da nuvem NUNCA remove o arquivo local.
          Seus dados locais são sempre preservados.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Synced songs */}
          {syncedSongs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Cloud size={13} className="text-blue-400" />
                <span className="text-xs font-semibold text-foreground">Na nuvem ({syncedSongs.length})</span>
              </div>
              <div className="space-y-1.5">
                {syncedSongs.map(({ song, localBytes }) => (
                  <div
                    key={song.id}
                    className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ background: `${song.coverColor || '#a855f7'}33`, color: song.coverColor || '#a855f7' }}
                    >
                      {song.title.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">{formatBytes(localBytes)}</span>
                      <button
                        onClick={() => handleDeleteFromCloud({ song, localBytes, isInCloud: true })}
                        disabled={deletingId === song.id || !isOnline}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 disabled:opacity-40"
                        aria-label="Excluir da nuvem"
                        title="Excluir da nuvem (arquivo local preservado)"
                      >
                        {deletingId === song.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Local only songs */}
          {localOnlySongs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <HardDrive size={13} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Apenas local ({localOnlySongs.length})</span>
              </div>
              <div className="space-y-1.5">
                {localOnlySongs.map(({ song, localBytes }) => (
                  <div
                    key={song.id}
                    className="flex items-center gap-3 p-3 bg-muted/10 rounded-xl opacity-70"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ background: `${song.coverColor || '#a855f7'}22`, color: song.coverColor || '#a855f7' }}
                    >
                      {song.title.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{formatBytes(localBytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {songs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <HardDrive size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma música na biblioteca local.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
