'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Cloud, Download, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Info, ChevronDown, ChevronUp, X, FileAudio, FileText,  } from 'lucide-react';
import {
  listCloudSongsForImport,
  importSongFromCloud,
  estimateImportBytes,
  type CloudSongInfo,
  type ImportProgress,
} from '@/lib/cloudImport';
import { useConnectivity } from '@/hooks/useConnectivity';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface ImportState {
  songId: string;
  phase: ImportProgress['phase'];
  progress: number;
  message: string;
  error?: string;
  filesImported?: string[];
}

export default function CloudImportPanel() {
  const { isOnline } = useConnectivity();
  const [cloudSongs, setCloudSongs] = useState<CloudSongInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importStates, setImportStates] = useState<Record<string, ImportState>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedSong, setExpandedSong] = useState<string | null>(null);

  const loadCloudSongs = useCallback(async () => {
    if (!isOnline) return;
    setLoading(true);
    setLoadError(null);
    try {
      const songs = await listCloudSongsForImport(200);
      setCloudSongs(songs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    if (isOnline) loadCloudSongs();
  }, [isOnline, loadCloudSongs]);

  const toggleSelect = useCallback((cloudId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cloudId)) next.delete(cloudId);
      else next.add(cloudId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const notImported = cloudSongs.filter((s) => !s.isLocallyImported).map((s) => s.cloudId);
    setSelected(new Set(notImported));
  }, [cloudSongs]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedSongs = cloudSongs.filter((s) => selected.has(s.cloudId));
  const estimatedBytes = estimateImportBytes(selectedSongs);

  const handleStartImport = useCallback(async () => {
    if (selectedSongs.length === 0) return;
    setShowConfirm(false);
    setIsImporting(true);

    for (const song of selectedSongs) {
      setImportStates((prev) => ({
        ...prev,
        [song.cloudId]: {
          songId: song.cloudId,
          phase: 'metadata',
          progress: 0,
          message: 'Aguardando...',
        },
      }));
    }

    for (const song of selectedSongs) {
      try {
        const result = await importSongFromCloud(song, (progress) => {
          setImportStates((prev) => ({
            ...prev,
            [song.cloudId]: {
              songId: song.cloudId,
              phase: progress.phase,
              progress: progress.progress,
              message: progress.message,
            },
          }));
        });

        setImportStates((prev) => ({
          ...prev,
          [song.cloudId]: {
            songId: song.cloudId,
            phase: 'done',
            progress: 100,
            message: 'Importado com sucesso!',
            filesImported: result.filesImported,
          },
        }));

        // Update the song in the list to show as imported
        setCloudSongs((prev) =>
          prev.map((s) =>
            s.cloudId === song.cloudId
              ? { ...s, isLocallyImported: true, localId: result.localId }
              : s
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setImportStates((prev) => ({
          ...prev,
          [song.cloudId]: {
            songId: song.cloudId,
            phase: 'error',
            progress: 0,
            message: 'Erro na importação',
            error: msg,
          },
        }));
      }
    }

    setIsImporting(false);
    setSelected(new Set());
    // Reload to refresh import status
    await loadCloudSongs();
  }, [selectedSongs, loadCloudSongs]);

  if (!isOnline) {
    return (
      <div className="bg-card-elevated rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Cloud size={18} className="text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Importar da Nuvem</h3>
            <p className="text-xs text-muted-foreground">Firebase → Dispositivo local</p>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            Sem conexão. Conecte-se à internet para importar músicas da nuvem.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card-elevated rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
            <Download size={18} className="text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Importar da Nuvem</h3>
            <p className="text-xs text-muted-foreground">Firebase → Dispositivo local</p>
          </div>
        </div>
        <button
          onClick={loadCloudSongs}
          disabled={loading}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 disabled:opacity-50"
          aria-label="Recarregar lista"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Info notice */}
      <div className="flex items-start gap-2 p-3 bg-blue-500/8 border border-blue-500/15 rounded-xl">
        <Info size={13} className="text-blue-400/80 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-300/70">
          Selecione músicas individualmente para baixar para este dispositivo.
          Após importar, as músicas ficam disponíveis offline.
          A importação não é automática.
        </p>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-red-300">{loadError}</p>
            <button
              onClick={loadCloudSongs}
              className="text-xs text-red-400 hover:text-red-300 mt-1 underline"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Carregando músicas da nuvem...</span>
        </div>
      )}

      {/* Song list */}
      {!loading && cloudSongs.length > 0 && (
        <>
          {/* Selection controls */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {cloudSongs.length} música(s) na nuvem
            </span>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                disabled={isImporting}
                className="text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                Selecionar todas
              </button>
              {selected.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Songs */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {cloudSongs.map((song) => {
              const isSelected = selected.has(song.cloudId);
              const importState = importStates[song.cloudId];
              const isExpanded = expandedSong === song.cloudId;

              return (
                <div
                  key={song.cloudId}
                  className={`rounded-xl border transition-all duration-150 ${
                    song.isLocallyImported
                      ? 'bg-green-500/5 border-green-500/15'
                      : isSelected
                      ? 'bg-blue-500/10 border-blue-500/30' :'bg-muted/15 border-border/30'
                  }`}
                >
                  <div className="flex items-center gap-3 p-3">
                    {/* Checkbox / status */}
                    <div className="flex-shrink-0">
                      {song.isLocallyImported ? (
                        <CheckCircle2 size={18} className="text-green-400" />
                      ) : importState?.phase === 'done' ? (
                        <CheckCircle2 size={18} className="text-green-400" />
                      ) : importState?.phase === 'error' ? (
                        <AlertTriangle size={18} className="text-red-400" />
                      ) : importState && importState.phase !== 'done' && importState.phase !== 'error' ? (
                        <Loader2 size={18} className="animate-spin text-blue-400" />
                      ) : (
                        <button
                          onClick={() => toggleSelect(song.cloudId)}
                          disabled={isImporting}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-blue-500 border-blue-500' :'border-border/60 hover:border-blue-400'
                          } disabled:opacity-50`}
                          aria-label={isSelected ? 'Desselecionar' : 'Selecionar'}
                        >
                          {isSelected && <X size={10} className="text-white" />}
                        </button>
                      )}
                    </div>

                    {/* Song info */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{
                        background: `${song.coverColor || '#a855f7'}33`,
                        color: song.coverColor || '#a855f7',
                      }}
                    >
                      {song.title.charAt(0)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>

                    {/* File indicators */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {song.hasOriginalAudio && (
                        <span title="Áudio original disponível">
                          <FileAudio size={12} className="text-blue-400/70" />
                        </span>
                      )}
                      {song.hasVocalsAudio && (
                        <span title="Vocais disponíveis">
                          <FileAudio size={12} className="text-purple-400/70" />
                        </span>
                      )}
                      {song.hasLyrics && (
                        <span title="Letra disponível">
                          <FileText size={12} className="text-green-400/70" />
                        </span>
                      )}
                    </div>

                    {/* Expand button */}
                    <button
                      onClick={() => setExpandedSong(isExpanded ? null : song.cloudId)}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      aria-label="Detalhes"
                    >
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>

                  {/* Import progress bar */}
                  {importState && importState.phase !== 'done' && importState.phase !== 'error' && (
                    <div className="px-3 pb-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{importState.message}</span>
                        <span>{importState.progress}%</span>
                      </div>
                      <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className="h-1.5 bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${importState.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {importState?.phase === 'error' && importState.error && (
                    <div className="px-3 pb-3">
                      <p className="text-xs text-red-400">{importState.error}</p>
                    </div>
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-border/20 pt-2 mt-1 space-y-1">
                      <p className="text-xs text-muted-foreground font-medium mb-1">Arquivos disponíveis:</p>
                      {[
                        { label: 'Áudio original', available: song.hasOriginalAudio },
                        { label: 'Vocais', available: song.hasVocalsAudio },
                        { label: 'Instrumental', available: song.hasInstrumentalAudio },
                        { label: 'Letra (LRC)', available: song.hasLyrics },
                      ].map(({ label, available }) => (
                        <div key={label} className="flex items-center gap-2 text-xs">
                          {available ? (
                            <CheckCircle2 size={11} className="text-green-400" />
                          ) : (
                            <X size={11} className="text-muted-foreground/40" />
                          )}
                          <span className={available ? 'text-foreground' : 'text-muted-foreground/50'}>
                            {label}
                          </span>
                        </div>
                      ))}
                      {song.isLocallyImported && (
                        <p className="text-xs text-green-400 mt-1">✓ Já importado neste dispositivo</p>
                      )}
                      {song.genre && (
                        <p className="text-xs text-muted-foreground">Gênero: {song.genre}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selection summary + import button */}
          {selected.size > 0 && !isImporting && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-muted-foreground">Selecionadas:</div>
                <div className="text-foreground font-medium">{selected.size} música(s)</div>
                <div className="text-muted-foreground">Tamanho estimado:</div>
                <div className="text-foreground font-medium">{formatBytes(estimatedBytes)}</div>
              </div>
              <p className="text-xs text-muted-foreground/70">
                * Estimativa baseada em tamanho médio. O tamanho real pode variar.
              </p>
              <button
                onClick={() => setShowConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-all duration-150 active:scale-95"
              >
                <Download size={15} />
                Importar {selected.size} música(s)
              </button>
            </div>
          )}

          {/* Empty state */}
          {cloudSongs.filter((s) => !s.isLocallyImported).length === 0 && (
            <div className="text-center py-4">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-green-400 opacity-70" />
              <p className="text-sm text-muted-foreground">Todas as músicas já foram importadas.</p>
            </div>
          )}
        </>
      )}

      {/* Empty cloud */}
      {!loading && cloudSongs.length === 0 && !loadError && (
        <div className="text-center py-8 text-muted-foreground">
          <Cloud size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma música encontrada na nuvem.</p>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <Download size={18} className="text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground text-sm">Confirmar importação</h4>
                <p className="text-xs text-muted-foreground">Firebase → Dispositivo local</p>
              </div>
            </div>

            <div className="p-3 bg-muted/20 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Músicas selecionadas:</span>
                <span className="text-foreground font-medium">{selected.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tamanho estimado:</span>
                <span className="text-foreground font-medium">{formatBytes(estimatedBytes)}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Info size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-300">
                Os arquivos serão baixados do Firebase Storage e salvos neste dispositivo.
                Após importar, ficam disponíveis offline.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleStartImport}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-all duration-150 active:scale-95"
              >
                <Download size={14} />
                Confirmar
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2.5 bg-muted/60 text-muted-foreground text-sm rounded-xl hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
