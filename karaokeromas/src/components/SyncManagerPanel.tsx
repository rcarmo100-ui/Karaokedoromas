'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CloudOff,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  HardDrive,
  RotateCcw,
} from 'lucide-react';
import { useConnectivity } from '@/hooks/useConnectivity';
import {
  analyzePendingSync,
  executeSyncToCloud,
  pullSongsFromCloud,
  type SyncAnalysis,
} from '@/lib/syncEngine';
import { settingsGet, settingsSet } from '@/lib/localDB';
import { repositoryGetSongsBySync } from '@/lib/songRepository';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type SyncPhase = 'idle' | 'analyzing' | 'confirming' | 'syncing' | 'done' | 'error';

export default function SyncManagerPanel() {
  const { isOnline, syncEnabled, toggleSync } = useConnectivity();
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [analysis, setAnalysis] = useState<SyncAnalysis | null>(null);
  const [syncResult, setSyncResult] = useState<{ synced: number; errors: string[] } | null>(null);
  const [syncProgress, setSyncProgress] = useState<Record<string, number>>({});
  const [storageLimit, setStorageLimit] = useState<number>(5 * 1024 * 1024 * 1024); // 5 GB default
  const [showLimitEditor, setShowLimitEditor] = useState(false);
  const [limitInput, setLimitInput] = useState('5');
  const [showDetails, setShowDetails] = useState(false);
  const [pullResult, setPullResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [errorSongsCount, setErrorSongsCount] = useState(0);

  useEffect(() => {
    settingsGet<number>('storageLimit', 5 * 1024 * 1024 * 1024).then((v) => {
      setStorageLimit(v);
      setLimitInput((v / (1024 * 1024 * 1024)).toFixed(0));
    });
  }, []);

  // Count songs with SYNC_ERROR for retry badge
  useEffect(() => {
    repositoryGetSongsBySync('SYNC_ERROR').then((songs) => {
      setErrorSongsCount(songs.length);
    }).catch(() => {});
  }, [phase]);

  const handleAnalyze = useCallback(async () => {
    setPhase('analyzing');
    try {
      const result = await analyzePendingSync();
      setAnalysis(result);
      setPhase('confirming');
    } catch (err) {
      console.error('[SyncManagerPanel] analyze error:', err);
      setPhase('error');
    }
  }, []);

  const handleRetryErrors = useCallback(async () => {
    setPhase('analyzing');
    try {
      // Get only SYNC_ERROR songs for retry
      const errorSongs = await repositoryGetSongsBySync('SYNC_ERROR');
      if (errorSongs.length === 0) {
        setPhase('idle');
        return;
      }

      // Build a minimal analysis for confirmation
      const { localGetSongStorageBytes } = await import('@/lib/localDB');
      let totalBytes = 0;
      let totalFiles = 0;
      const songDetails: SyncAnalysis['songDetails'] = [];

      for (const song of errorSongs) {
        const bytes = await localGetSongStorageBytes(song.id);
        const hasOriginalAudio = Boolean(song.localOriginalAudioKey);
        if (hasOriginalAudio) totalFiles++;
        totalBytes += bytes;
        songDetails.push({ song, bytes, hasOriginalAudio });
      }

      setAnalysis({
        pendingSongs: errorSongs,
        totalBytes,
        totalFiles,
        songDetails,
      });
      setPhase('confirming');
    } catch (err) {
      console.error('[SyncManagerPanel] retry analyze error:', err);
      setPhase('error');
    }
  }, []);

  const handleConfirmSync = useCallback(async () => {
    if (!analysis) return;

    // Check storage limit
    const newTotal = analysis.totalBytes;
    if (newTotal > storageLimit) {
      const overBy = newTotal - storageLimit;
      const confirmed = window.confirm(
        `⚠️ AVISO DE LIMITE DE ARMAZENAMENTO\n\n` +
        `Tamanho do upload: ${formatBytes(analysis.totalBytes)}\n` +
        `Limite configurado: ${formatBytes(storageLimit)}\n` +
        `Excede em: ${formatBytes(overBy)}\n\n` +
        `Deseja continuar mesmo assim?`
      );
      if (!confirmed) {
        setPhase('idle');
        return;
      }
    }

    setPhase('syncing');
    setSyncProgress({});

    try {
      const result = await executeSyncToCloud(
        undefined,
        (songId, pct) => {
          setSyncProgress((prev) => ({ ...prev, [songId]: pct }));
        }
      );
      setSyncResult(result);
      setPhase(result.errors.length > 0 ? 'error' : 'done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncResult({ synced: 0, errors: [msg] });
      setPhase('error');
    }
  }, [analysis, storageLimit]);

  const handlePullFromCloud = useCallback(async () => {
    setPhase('syncing');
    try {
      const result = await pullSongsFromCloud();
      setPullResult(result);
      setPhase('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPullResult({ imported: 0, errors: [msg] });
      setPhase('error');
    }
  }, []);

  const handleSaveLimit = useCallback(async () => {
    const gb = parseFloat(limitInput);
    if (isNaN(gb) || gb <= 0) return;
    const bytes = Math.round(gb * 1024 * 1024 * 1024);
    setStorageLimit(bytes);
    await settingsSet('storageLimit', bytes);
    setShowLimitEditor(false);
  }, [limitInput]);

  const handleReset = useCallback(() => {
    setPhase('idle');
    setAnalysis(null);
    setSyncResult(null);
    setPullResult(null);
    setSyncProgress({});
  }, []);

  return (
    <div className="bg-card-elevated rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Cloud size={18} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Sincronização com a Nuvem</h3>
            <p className="text-xs text-muted-foreground">Firebase Storage — opcional</p>
          </div>
        </div>

        {/* Sync toggle */}
        <button
          onClick={() => toggleSync(!syncEnabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
            syncEnabled ? 'bg-blue-500' : 'bg-muted/60'
          }`}
          aria-label={syncEnabled ? 'Desativar sincronização' : 'Ativar sincronização'}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
              syncEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Sync disabled notice */}
      {!syncEnabled && (
        <div className="flex items-start gap-2 p-3 bg-muted/30 border border-border/40 rounded-xl">
          <CloudOff size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Sincronização desativada. O aplicativo funciona normalmente no modo local.
            Ative para fazer backup na nuvem.
          </p>
        </div>
      )}

      {/* Offline notice */}
      {syncEnabled && !isOnline && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            Sem conexão com a internet. A sincronização será possível quando você estiver online.
          </p>
        </div>
      )}

      {/* Retry notice for SYNC_ERROR songs */}
      {errorSongsCount > 0 && syncEnabled && isOnline && phase === 'idle' && (
        <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-red-300 font-medium">
                {errorSongsCount} música(s) com erro de sincronização
              </p>
              <p className="text-xs text-red-300/70 mt-0.5">
                Dados locais preservados. Você pode tentar novamente.
              </p>
            </div>
          </div>
          <button
            onClick={handleRetryErrors}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-xs font-medium rounded-lg transition-all duration-150 active:scale-95 flex-shrink-0 ml-2"
          >
            <RotateCcw size={12} />
            Tentar novamente
          </button>
        </div>
      )}

      {/* Storage limit */}
      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl">
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Limite de segurança:</span>
          <span className="text-xs font-semibold text-foreground">{formatBytes(storageLimit)}</span>
        </div>
        <button
          onClick={() => setShowLimitEditor(!showLimitEditor)}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          Alterar
        </button>
      </div>

      {/* Limit editor */}
      {showLimitEditor && (
        <div className="flex items-center gap-2 p-3 bg-muted/20 rounded-xl">
          <input
            type="number"
            min="0.1"
            step="0.5"
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            className="w-20 bg-input border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
          />
          <span className="text-xs text-muted-foreground">GB</span>
          <button
            onClick={handleSaveLimit}
            className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Salvar
          </button>
          <button
            onClick={() => setShowLimitEditor(false)}
            className="px-3 py-1.5 bg-muted/60 text-muted-foreground text-xs rounded-lg hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Cost warning */}
      <div className="flex items-start gap-2 p-3 bg-amber-500/8 border border-amber-500/15 rounded-xl">
        <Info size={13} className="text-amber-400/80 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-300/70">
          O armazenamento em nuvem pode gerar custos dependendo do uso e das franquias do Firebase.
          Monitore o tamanho dos uploads antes de sincronizar.
          O limite acima é um limite de segurança da aplicação, não um limite financeiro real.
        </p>
      </div>

      {/* Actions */}
      {syncEnabled && isOnline && (
        <div className="space-y-2">
          {phase === 'idle' && (
            <div className="flex gap-2">
              <button
                onClick={handleAnalyze}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 text-sm font-medium rounded-xl transition-all duration-150 active:scale-95"
              >
                <Upload size={15} />
                Sincronizar músicas locais
              </button>
              <button
                onClick={handlePullFromCloud}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-muted/40 hover:bg-muted/60 border border-border text-muted-foreground text-sm font-medium rounded-xl transition-all duration-150 active:scale-95"
              >
                <RefreshCw size={15} />
                Importar da nuvem
              </button>
            </div>
          )}

          {phase === 'analyzing' && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Analisando músicas pendentes...</span>
            </div>
          )}

          {phase === 'confirming' && analysis && (
            <div className="space-y-3">
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-2">
                <p className="text-sm font-semibold text-foreground">Confirmar sincronização</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-muted-foreground">Músicas selecionadas:</div>
                  <div className="text-foreground font-medium">{analysis.pendingSongs.length}</div>
                  <div className="text-muted-foreground">Arquivos de áudio:</div>
                  <div className="text-foreground font-medium">{analysis.totalFiles}</div>
                  <div className="text-muted-foreground">Tamanho total:</div>
                  <div className="text-foreground font-medium">{formatBytes(analysis.totalBytes)}</div>
                  <div className="text-muted-foreground">Limite configurado:</div>
                  <div className={`font-medium ${analysis.totalBytes > storageLimit ? 'text-red-400' : 'text-green-400'}`}>
                    {formatBytes(storageLimit)}
                  </div>
                </div>

                {analysis.totalBytes > storageLimit && (
                  <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertTriangle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-300">
                      Upload excede o limite de segurança em {formatBytes(analysis.totalBytes - storageLimit)}.
                    </p>
                  </div>
                )}

                {/* Song details toggle */}
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {showDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
                </button>

                {showDetails && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {analysis.songDetails.map(({ song, bytes, hasOriginalAudio }) => (
                      <div key={song.id} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                        <div className="flex-1 min-w-0">
                          <span className="text-foreground truncate block">{song.title}</span>
                          <span className="text-muted-foreground">{song.artist}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          {hasOriginalAudio && <span className="text-green-400">🎵</span>}
                          <span className="text-muted-foreground">{formatBytes(bytes)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleConfirmSync}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition-all duration-150 active:scale-95"
                >
                  <Upload size={15} />
                  Confirmar upload
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2.5 bg-muted/60 text-muted-foreground text-sm rounded-xl hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {phase === 'syncing' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 size={16} className="animate-spin text-blue-400" />
                <span className="text-sm">Sincronizando...</span>
              </div>
              {Object.entries(syncProgress).map(([songId, pct]) => (
                <div key={songId} className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Enviando...</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-1.5 bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {(phase === 'done' || phase === 'error') && (
            <div className="space-y-3">
              {syncResult && (
                <div className={`p-3 rounded-xl border ${
                  syncResult.errors.length === 0
                    ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {syncResult.errors.length === 0 ? (
                      <CheckCircle2 size={14} className="text-green-400" />
                    ) : (
                      <AlertTriangle size={14} className="text-amber-400" />
                    )}
                    <span className="text-sm font-medium text-foreground">
                      {syncResult.synced} música(s) sincronizada(s)
                    </span>
                  </div>
                  {syncResult.errors.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {syncResult.errors.map((e, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <XCircle size={11} className="text-red-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-red-300">{e}</p>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground mt-1">
                        Os arquivos locais foram preservados. Você pode tentar novamente.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {pullResult && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" />
                    <span className="text-sm text-foreground">
                      {pullResult.imported} música(s) importada(s) da nuvem
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-2.5 bg-muted/60 text-muted-foreground text-sm rounded-xl hover:bg-muted transition-colors"
                >
                  Fechar
                </button>
                {syncResult && syncResult.errors.length > 0 && (
                  <button
                    onClick={handleRetryErrors}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-sm font-medium rounded-xl transition-all duration-150 active:scale-95"
                  >
                    <RotateCcw size={14} />
                    Tentar novamente
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
