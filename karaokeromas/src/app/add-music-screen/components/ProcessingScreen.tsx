'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  CircleCheck,
  Circle,
  Loader2,
  Music2,
  Mic2,
  Wand2,
  FileText,
  Play,
  Info,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { genreColorMap } from '@/lib/songStore';
import type { AddMusicFormData } from '@/app/add-music-screen/page';
import {
  observeSong,
  observeProcessingJobs,
  restartProcessingJob,
  getProcessingJobs,
} from '@/lib/firestoreService';
import type {
  SongDocument,
  ProcessingJobDocument,
  ProcessingStep,
  ProcessingJobStatus,
} from '@/lib/firestoreService';

interface ProcessingScreenProps {
  formData: AddMusicFormData;
  onComplete: () => void;
  isDone: boolean;
}

// ── Step definitions (display metadata) ──────────────────────────────────────

interface StepDef {
  step: ProcessingStep;
  label: string;
  description: string;
  icon: React.ElementType;
}

const STEP_DEFS: StepDef[] = [
  {
    step: 'audio_extraction',
    label: 'Extração de áudio',
    description: 'Áudio original fornecido pelo usuário',
    icon: Music2,
  },
  {
    step: 'vocal_separation',
    label: 'Separação vocal',
    description: 'Separando voz e instrumental com IA',
    icon: Mic2,
  },
  {
    step: 'lyrics_sync',
    label: 'Sincronização das letras',
    description: 'Alinhando a letra com o áudio',
    icon: FileText,
  },
  {
    step: 'finalization',
    label: 'Finalização',
    description: 'Preparando o karaokê para reprodução',
    icon: Wand2,
  },
];

// ── Status helpers ────────────────────────────────────────────────────────────

function getJobForStep(
  jobs: ProcessingJobDocument[],
  step: ProcessingStep
): ProcessingJobDocument | undefined {
  return jobs.find((j) => j.step === step);
}

function stepStatusLabel(status: ProcessingJobStatus | undefined): string {
  if (!status) return 'Aguardando';
  const map: Record<ProcessingJobStatus, string> = {
    queued: 'Aguardando',
    running: 'Processando',
    done: 'Concluído',
    error: 'Erro',
  };
  return map[status] ?? status;
}

export default function ProcessingScreen({ formData, onComplete, isDone }: ProcessingScreenProps) {
  const songId = formData.songId ?? null;

  const [song, setSong] = useState<SongDocument | null>(null);
  const [jobs, setJobs] = useState<ProcessingJobDocument[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // ── Firestore listeners ───────────────────────────────────────────────────

  useEffect(() => {
    if (!songId) return;

    const unsubSong = observeSong(
      songId,
      (s) => {
        setSong(s);
        // When song becomes ready, notify parent
        if (s?.status === 'ready') {
          onComplete();
        }
      },
      (err) => {
        console.error('[ProcessingScreen] observeSong error:', err);
        setLoadError('Erro ao monitorar a música. Verifique sua conexão.');
      }
    );

    const unsubJobs = observeProcessingJobs(
      songId,
      (j) => setJobs(j),
      (err) => {
        console.error('[ProcessingScreen] observeProcessingJobs error:', err);
      }
    );

    return () => {
      unsubSong();
      unsubJobs();
    };
  }, [songId, onComplete]);

  // ── Retry handler ─────────────────────────────────────────────────────────

  const handleRetry = useCallback(async () => {
    if (!songId) return;
    setRetrying(true);
    setLoadError(null);
    try {
      // Find the errored job and restart it
      const allJobs = await getProcessingJobs(songId);
      const erroredJob = allJobs.find((j) => j.status === 'error');
      if (erroredJob?.id) {
        await restartProcessingJob(songId, erroredJob.id);
      }
    } catch (err) {
      console.error('[ProcessingScreen] handleRetry error:', err);
      setLoadError('Não foi possível reiniciar o processamento. Tente novamente.');
    } finally {
      setRetrying(false);
    }
  }, [songId]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const songStatus = song?.status ?? 'queued';
  const isReady = songStatus === 'ready';
  const hasError = songStatus === 'error' || jobs.some((j) => j.status === 'error');
  const hasOriginalAudio = Boolean(song?.originalAudioPath);

  // Compute overall progress: average of all job progress values
  const overallProgress = React.useMemo(() => {
    if (isReady) return 100;
    if (jobs.length === 0) return 0;
    const total = jobs.reduce((sum, j) => sum + (j.progress ?? 0), 0);
    // Spread across 4 steps even if only 1 job exists so far
    return Math.round(total / (STEP_DEFS.length * 100) * 100);
  }, [jobs, isReady]);

  const genreColor =
    genreColorMap[formData.genre.toLowerCase().replace(/ /g, '-')] || '#a855f7';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto fade-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center flex-shrink-0">
            <Wand2 size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isReady
                ? 'Música pronta!'
                : hasError
                ? 'Erro no processamento' :'Processando sua música...'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isReady
                ? 'Sua música foi adicionada à biblioteca'
                : hasError
                ? 'Ocorreu um erro durante o processamento' :'Acompanhe o progresso em tempo real'}
            </p>
          </div>
        </div>
      </div>

      {/* Song info card */}
      <div className="bg-card-elevated rounded-2xl p-5 mb-6 flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-extrabold flex-shrink-0"
          style={{
            background: `${genreColor}33`,
            color: genreColor,
            border: `2px solid ${genreColor}55`,
          }}
        >
          {formData.title.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{formData.title}</p>
          <p className="text-sm text-muted-foreground truncate">{formData.artist}</p>
          {formData.genre && (
            <span
              className="genre-badge mt-1 inline-block"
              style={{ color: genreColor, background: `${genreColor}22` }}
            >
              {formData.genre}
            </span>
          )}
        </div>
        {isReady && <CircleCheck size={24} className="text-green-400 flex-shrink-0" />}
        {hasError && <AlertCircle size={24} className="text-red-400 flex-shrink-0" />}
      </div>

      {/* Original audio available badge */}
      {hasOriginalAudio && !isReady && (
        <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl mb-4">
          <Upload size={15} className="text-green-400 flex-shrink-0" />
          <p className="text-xs text-green-300 font-medium">
            Áudio original disponível no Firebase Storage — aguardando processamento pelo worker
          </p>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Progresso</span>
          <span className="text-xs font-mono-nums text-primary">{overallProgress}%</span>
        </div>
        <div className="progress-bar-track h-2">
          <div
            className="progress-bar-fill h-2"
            style={{ width: `${overallProgress}%`, transition: 'width 0.5s ease' }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div className="bg-card-elevated rounded-2xl p-5 sm:p-6 space-y-5 mb-6">
        {STEP_DEFS.map((stepDef) => {
          const job = getJobForStep(jobs, stepDef.step);
          const jobStatus: ProcessingJobStatus | undefined = job?.status;

          const isActive = jobStatus === 'running';
          const isDoneStep = jobStatus === 'done';
          const isErrorStep = jobStatus === 'error';
          const isQueued = !jobStatus || jobStatus === 'queued';

          // Special case: audio_extraction is considered "ready" when originalAudioPath exists
          const isAudioExtractionWithFile =
            stepDef.step === 'audio_extraction' && hasOriginalAudio && isQueued;

          return (
            <div key={stepDef.step} className="flex items-start gap-4">
              {/* Step icon/status */}
              <div className="flex-shrink-0 mt-0.5">
                {isDoneStep || isAudioExtractionWithFile ? (
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CircleCheck size={18} className="text-green-400" />
                  </div>
                ) : isErrorStep ? (
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                    <AlertCircle size={18} className="text-red-400" />
                  </div>
                ) : isActive ? (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center processing-step-active">
                    <Loader2 size={18} className="text-primary animate-spin" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted/40 flex items-center justify-center">
                    <Circle size={18} className="text-muted-foreground/40" />
                  </div>
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className={`text-sm font-semibold ${
                      isActive
                        ? 'text-primary'
                        : isDoneStep || isAudioExtractionWithFile
                        ? 'text-foreground'
                        : isErrorStep
                        ? 'text-red-400' :'text-muted-foreground/60'
                    }`}
                  >
                    {stepDef.label}
                  </p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'text-primary/80 bg-primary/10 border border-primary/20'
                        : isDoneStep || isAudioExtractionWithFile
                        ? 'text-green-400/80 bg-green-400/10 border border-green-400/20'
                        : isErrorStep
                        ? 'text-red-400/80 bg-red-400/10 border border-red-400/20' :'text-muted-foreground/50 bg-muted/30 border border-muted/20'
                    }`}
                  >
                    {isAudioExtractionWithFile ? 'Áudio disponível' : stepStatusLabel(jobStatus)}
                  </span>
                </div>
                <p
                  className={`text-xs mt-0.5 ${
                    isActive ? 'text-muted-foreground' : 'text-muted-foreground/50'
                  }`}
                >
                  {isErrorStep && job?.errorMessage
                    ? job.errorMessage
                    : isAudioExtractionWithFile
                    ? 'Arquivo de áudio enviado para o Firebase Storage'
                    : stepDef.description}
                </p>
                {/* Per-step progress bar when running */}
                {isActive && job && job.progress > 0 && (
                  <div className="mt-2 progress-bar-track h-1">
                    <div
                      className="progress-bar-fill h-1"
                      style={{ width: `${job.progress}%`, transition: 'width 0.4s ease' }}
                    />
                  </div>
                )}
              </div>

              {/* Decorative icon */}
              <div className="flex-shrink-0">
                <stepDef.icon
                  size={16}
                  className={`${
                    isActive
                      ? 'text-primary'
                      : isDoneStep || isAudioExtractionWithFile
                      ? 'text-green-400/60'
                      : isErrorStep
                      ? 'text-red-400/60' :'text-muted-foreground/20'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Error notice */}
      {hasError && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl mb-6">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300 mb-1">Erro no processamento</p>
            <p className="text-xs text-red-200/70 leading-relaxed">
              Ocorreu um erro durante o processamento da música. Você pode tentar novamente.
            </p>
          </div>
        </div>
      )}

      {/* Load error notice */}
      {loadError && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-6">
          <Info size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/70 leading-relaxed">{loadError}</p>
        </div>
      )}

      {/* Queued/processing notice */}
      {!isReady && !hasError && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-6">
          <Info size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300 mb-1">Sobre o processamento</p>
            <p className="text-xs text-amber-200/70 leading-relaxed">
              O processamento real (separação vocal, sincronização) será executado por um
              worker externo em etapa futura. Por enquanto, a música aguarda na fila com o áudio original armazenado.
            </p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 slide-up">
        {/* Abrir Karaokê — only when ready */}
        {isReady && (
          <Link
            href={songId ? `/karaoke-player-screen?songId=${songId}` : '/karaoke-player-screen'}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-gradient-primary text-white font-bold text-base rounded-2xl glow-primary transition-all duration-200 hover:scale-105 active:scale-95 flex-1"
          >
            <Play size={18} fill="white" />
            Abrir Karaokê
          </Link>
        )}

        {/* Disabled state when not ready */}
        {!isReady && !hasError && (
          <div className="flex items-center justify-center gap-2 px-8 py-4 bg-muted/40 border border-border text-muted-foreground font-bold text-base rounded-2xl flex-1 cursor-not-allowed select-none">
            <Loader2 size={18} className="animate-spin" />
            {songStatus === 'queued' ? 'Aguardando processamento...' : 'Processando...'}
          </div>
        )}

        {/* Retry button when error */}
        {hasError && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-gradient-primary text-white font-bold text-base rounded-2xl glow-primary transition-all duration-200 hover:scale-105 active:scale-95 flex-1 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {retrying ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
            {retrying ? 'Reiniciando...' : 'Tentar novamente'}
          </button>
        )}

        <Link
          href="/"
          className="flex items-center justify-center gap-2 px-6 py-4 bg-muted/60 border border-border text-muted-foreground font-semibold text-base rounded-2xl transition-all duration-200 hover:bg-muted hover:text-foreground active:scale-95"
        >
          <ArrowLeft size={16} />
          Início
        </Link>
      </div>
    </div>
  );
}