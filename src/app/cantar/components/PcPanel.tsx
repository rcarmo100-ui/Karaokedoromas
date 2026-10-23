'use client';

/**
 * Aba "PC" da tela Cantar (Fase 2): conexão com o serviço do PC,
 * envio de link/arquivo para separar a voz, acompanhamento e importação
 * automática para a biblioteca do aparelho.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Cpu,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Play,
  Upload,
  Link2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  getPcAddress,
  setPcAddress,
  normalizePcAddress,
  pcHealth,
  pcListJobs,
  pcCreateJobFromYouTube,
  pcCreateJobFromFile,
  pcRetryJob,
  pcDeleteJob,
  importJobToLibrary,
  findImportedSong,
  PcWorkerError,
  type PcHealth,
  type PcJob,
} from '@/lib/pcWorker';
import { extractYouTubeVideoId } from '@/lib/youtube';

const STATUS_LABEL: Record<PcJob['status'], string> = {
  na_fila: 'Na fila',
  baixando: 'Baixando',
  separando: 'Separando a voz',
  pronto: 'Pronto',
  erro: 'Erro',
};

interface Props {
  /** Toca uma música já salva no aparelho */
  onPlayLocal: (localId: string) => void;
  /** Avisa que a biblioteca mudou (nova música importada) */
  onLibraryChanged: () => void;
  /** Incrementado pelo pai quando um trabalho novo é enviado de fora (busca) */
  refreshToken: number;
  active: boolean;
}

export default function PcPanel({ onPlayLocal, onLibraryChanged, refreshToken, active }: Props) {
  const [address, setAddress] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [health, setHealth] = useState<PcHealth | null>(null);
  const [connError, setConnError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [jobs, setJobs] = useState<PcJob[]>([]);
  const [imported, setImported] = useState<Record<string, string>>({}); // jobId → localId
  const [importing, setImporting] = useState<Record<string, boolean>>({});
  const [importError, setImportError] = useState<Record<string, string>>({});
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const a = getPcAddress();
    setAddress(a);
    setAddressInput(a);
  }, []);

  const connect = useCallback(async () => {
    setChecking(true);
    try {
      const h = await pcHealth();
      setHealth(h);
      setConnError(null);
      return true;
    } catch (err) {
      setHealth(null);
      setConnError(err instanceof PcWorkerError ? err.message : 'Não consegui falar com o PC.');
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const list = await pcListJobs();
      setJobs(list);
      setConnError(null);
      // Descobre quais já estão na biblioteca
      const map: Record<string, string> = {};
      for (const job of list.filter((j) => j.status === 'pronto')) {
        const song = await findImportedSong(job);
        if (song?.localInstrumentalAudioKey) map[job.id] = song.id;
      }
      setImported((prev) => ({ ...prev, ...map }));
      return list;
    } catch (err) {
      if (err instanceof PcWorkerError && err.offline) {
        setHealth(null);
        setConnError(err.message);
      }
      return null;
    }
  }, []);

  const importJob = useCallback(
    async (job: PcJob) => {
      if (importingRef.current.has(job.id)) return;
      importingRef.current.add(job.id);
      setImporting((p) => ({ ...p, [job.id]: true }));
      setImportError((p) => ({ ...p, [job.id]: '' }));
      try {
        const localId = await importJobToLibrary(job);
        setImported((p) => ({ ...p, [job.id]: localId }));
        onLibraryChanged();
      } catch (err) {
        setImportError((p) => ({
          ...p,
          [job.id]: err instanceof Error ? err.message : 'Falha ao salvar no aparelho.',
        }));
      } finally {
        importingRef.current.delete(job.id);
        setImporting((p) => ({ ...p, [job.id]: false }));
      }
    },
    [onLibraryChanged]
  );

  // Conecta ao abrir a aba e quando o endereço muda
  useEffect(() => {
    if (!active || !address) return;
    connect().then((ok) => {
      if (ok) refreshJobs();
    });
  }, [active, address, connect, refreshJobs, refreshToken]);

  // Acompanha os trabalhos: rápido enquanto há algo em andamento
  const hasRunning = jobs.some((j) => j.status === 'na_fila' || j.status === 'baixando' || j.status === 'separando');
  useEffect(() => {
    if (!health) return;
    const interval = hasRunning ? 2500 : active ? 10000 : 30000;
    const timer = setInterval(refreshJobs, interval);
    return () => clearInterval(timer);
  }, [health, hasRunning, active, refreshJobs]);

  // Importa sozinho o que ficou pronto
  useEffect(() => {
    jobs
      .filter((j) => j.status === 'pronto' && j.tem_instrumental && !imported[j.id] && !importError[j.id])
      .forEach((j) => importJob(j));
  }, [jobs, imported, importError, importJob]);

  const saveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePcAddress(addressInput);
    if (!normalized) {
      setConnError('Endereço inválido. Exemplo: 192.168.0.10:8765');
      return;
    }
    setPcAddress(normalized);
    setAddress(normalized);
    setAddressInput(normalized);
    if (await connect()) refreshJobs();
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const videoId = extractYouTubeVideoId(link);
    if (!videoId || !/youtu/i.test(link)) {
      setFormError('Cole um link do YouTube.');
      return;
    }
    setBusy(true);
    try {
      await pcCreateJobFromYouTube({ url: link.trim(), videoId });
      setLink('');
      await refreshJobs();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não consegui enviar.');
    } finally {
      setBusy(false);
    }
  };

  const sendFile = async (file: File | undefined) => {
    if (!file) return;
    setFormError(null);
    setBusy(true);
    try {
      await pcCreateJobFromFile(file, file.name.replace(/\.[^.]+$/, ''));
      await refreshJobs();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não consegui enviar o arquivo.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const retry = async (id: string) => {
    try {
      await pcRetryJob(id);
      await refreshJobs();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não consegui tentar de novo.');
    }
  };

  const remove = async (id: string) => {
    try {
      await pcDeleteJob(id);
      await refreshJobs();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não consegui apagar.');
    }
  };

  const missing = health ? (['ffmpeg', 'yt_dlp', 'demucs'] as const).filter((k) => !health[k]) : [];

  return (
    <div className="space-y-4">
      {/* Conexão */}
      <div className="rounded-xl bg-muted/30 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          {checking ? (
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          ) : health ? (
            <Wifi size={14} className="text-green-400" />
          ) : (
            <WifiOff size={14} className="text-muted-foreground" />
          )}
          <span className="font-medium">
            {health ? 'PC conectado' : checking ? 'Procurando o PC…' : 'PC não encontrado'}
          </span>
          {health && (
            <span className="text-xs text-muted-foreground">
              · {health.gpu ? 'placa de vídeo' : 'processador'}
            </span>
          )}
        </div>
        {connError && !health && <p className="text-xs text-muted-foreground">{connError}</p>}
        {missing.length > 0 && (
          <p className="text-xs text-yellow-300/90">
            Falta instalar no PC: {missing.join(', ')}. Rode o instalar.bat de novo.
          </p>
        )}
        <form onSubmit={saveAddress} className="flex gap-2">
          <input
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Endereço do PC, ex.: 192.168.0.10:8765"
            className="flex-1 min-w-0 bg-input border border-border rounded-lg px-3 py-2 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            inputMode="url"
          />
          <button type="submit" className="px-3 rounded-lg bg-muted text-xs font-medium">
            Conectar
          </button>
        </form>
      </div>

      {/* Enviar */}
      {health && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Para músicas sem versão karaokê: o PC baixa a original, tira a voz e o app salva aqui para tocar até sem internet.
          </p>
          <form onSubmit={sendLink} className="flex gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Link do YouTube da música original"
              className="flex-1 min-w-0 bg-input border border-border rounded-xl px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={busy || !link.trim()}
              className="px-3 rounded-xl bg-primary text-white disabled:opacity-50"
              aria-label="Enviar link para o PC"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
            </button>
          </form>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-muted/50 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Upload size={14} /> Enviar arquivo de áudio
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg"
            className="hidden"
            onChange={(e) => sendFile(e.target.files?.[0])}
          />
          {formError && <p className="text-sm text-red-400">{formError}</p>}
        </div>
      )}

      {/* Trabalhos */}
      {jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((job) => {
            const running = job.status === 'baixando' || job.status === 'separando';
            const localId = imported[job.id];
            return (
              <li key={job.id} className="rounded-xl bg-muted/30 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">
                    {job.status === 'pronto' ? (
                      <CheckCircle2 size={16} className="text-green-400" />
                    ) : job.status === 'erro' ? (
                      <AlertTriangle size={16} className="text-red-400" />
                    ) : running ? (
                      <Loader2 size={16} className="animate-spin text-primary" />
                    ) : (
                      <Cpu size={16} className="text-muted-foreground" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{job.titulo || job.origem}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {STATUS_LABEL[job.status]}
                      {running ? ` · ${job.progresso}%` : ''}
                      {job.artista ? ` · ${job.artista}` : ''}
                    </p>
                    {job.status === 'erro' && <p className="text-xs text-red-400 mt-1">{job.mensagem}</p>}
                    {running && (
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${job.progresso}%` }} />
                      </div>
                    )}
                    {job.status === 'pronto' && !localId && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {importing[job.id] ? 'Salvando no aparelho…' : importError[job.id] || ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 justify-end">
                  {localId && (
                    <button
                      onClick={() => onPlayLocal(localId)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-white text-xs font-semibold"
                    >
                      <Play size={12} fill="white" /> Cantar
                    </button>
                  )}
                  {job.status === 'pronto' && !localId && importError[job.id] && (
                    <button onClick={() => importJob(job)} className="px-2 py-1 rounded-lg bg-muted text-xs">
                      Salvar de novo
                    </button>
                  )}
                  {job.status === 'erro' && (
                    <button onClick={() => retry(job.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-xs">
                      <RotateCcw size={12} /> Tentar de novo
                    </button>
                  )}
                  {!running && (
                    <button
                      onClick={() => remove(job.id)}
                      className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                      aria-label="Apagar do PC"
                      title={localId ? 'Apagar do PC (a música continua salva no aparelho)' : 'Apagar'}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {health && jobs.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nada no PC ainda. Na aba Buscar, toque em <strong>PC</strong> numa música para separar a voz.
        </p>
      )}

      {!health && !checking && (
        <p className="text-xs text-muted-foreground">
          Para usar: no PC de casa, abra o <strong>iniciar.bat</strong> da pasta pc-worker e coloque aqui o endereço que
          aparece na janela. Instruções em pc-worker/LEIA-ME.md.
        </p>
      )}
    </div>
  );
}
