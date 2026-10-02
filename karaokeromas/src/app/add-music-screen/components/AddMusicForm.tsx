'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import {
  Music2,
  Mic2,
  Video,
  Tag,
  FileText,
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Info,
  CircleCheck,
  Upload,
  File,
  X,
} from 'lucide-react';
import { genreOptions } from '@/lib/songStore';
import { addSong, createProcessingJob, updateSong } from '@/lib/firestoreService';
import { uploadAudioFile } from '@/lib/storageService';
import { repositoryCreateSong, repositorySaveAudioFile } from '@/lib/songRepository';
import { queueSongForProcessing } from '@/lib/localProcessingQueue';
import { isOnline } from '@/lib/connectivityManager';
import type { AddMusicFormData } from '@/app/add-music-screen/page';

// ── Audio file constraints ────────────────────────────────────────────────────

/** Accepted MIME types for audio upload */
const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'];

/** Accepted file extensions (for input accept attribute and validation) */
const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.m4a'];

/** Maximum file size: 300 MB */
const MAX_FILE_SIZE_BYTES = 300 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = '300 MB';

// ── Upload state ──────────────────────────────────────────────────────────────

type UploadPhase =
  | 'idle' |'preparing' |'uploading' |'done' |'error';

interface UploadState {
  phase: UploadPhase;
  progress: number; // 0–100
  errorMessage?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AddMusicFormProps {
  onSubmit: (data: AddMusicFormData & { songId: string }) => void;
}

interface FormErrors {
  title?: string;
  artist?: string;
  genre?: string;
  youtubeUrl?: string;
  audioFile?: string;
}

export default function AddMusicForm({ onSubmit }: AddMusicFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Audio file state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle', progress: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Audio file validation ───────────────────────────────────────────────────

  function validateAudioFile(file: File): string | null {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const mimeOk = ACCEPTED_AUDIO_TYPES.includes(file.type) || file.type === '';
    const extOk = ACCEPTED_EXTENSIONS.includes(ext);

    if (!mimeOk && !extOk) {
      return `Formato não suportado. Use ${ACCEPTED_EXTENSIONS.join(', ')}.`;
    }
    if (file.size === 0) {
      return 'O arquivo está vazio. Selecione um arquivo de áudio válido.';
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(0);
      return `O arquivo é muito grande (${sizeMB} MB). O limite é ${MAX_FILE_SIZE_LABEL}.`;
    }
    return null;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setAudioFile(null);
      return;
    }
    const validationError = validateAudioFile(file);
    if (validationError) {
      setErrors((prev) => ({ ...prev, audioFile: validationError }));
      setAudioFile(null);
      // Reset input so user can re-select
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setErrors((prev) => ({ ...prev, audioFile: undefined }));
    setAudioFile(file);
    setUploadState({ phase: 'idle', progress: 0 });
  }

  function handleRemoveFile() {
    setAudioFile(null);
    setUploadState({ phase: 'idle', progress: 0 });
    setErrors((prev) => ({ ...prev, audioFile: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Form validation ─────────────────────────────────────────────────────────

  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!title || title.length < 2) newErrors.title = 'O nome da música é obrigatório';
    if (!artist || artist.length < 2) newErrors.artist = 'O nome do artista é obrigatório';
    if (!genre) newErrors.genre = 'Selecione um gênero musical';
    if (youtubeUrl && !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(youtubeUrl)) {
      newErrors.youtubeUrl = 'Digite uma URL válida do YouTube';
    }
    if (!audioFile) {
      newErrors.audioFile = 'Selecione um arquivo de áudio para continuar';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // ── Submit handler ──────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!audioFile) return; // type guard

    setIsSubmitting(true);
    setSubmitError(null);

    let songId: string | null = null;

    try {
      // ── STEP 1: Save locally first (LOCAL-FIRST architecture) ──────────────
      console.log('[AddMusicForm] Step 1: Saving song to LOCAL database (IndexedDB)...');
      setUploadState({ phase: 'preparing', progress: 0 });

      songId = await repositoryCreateSong({
        title,
        artist,
        genre,
        youtubeUrl: youtubeUrl || undefined,
        notes: notes || undefined,
      });
      console.log('[AddMusicForm] Step 1 done — local songId:', songId);

      // ── STEP 2: Save audio file locally ───────────────────────────────────
      console.log('[AddMusicForm] Step 2: Saving audio file to local storage...');
      setUploadState({ phase: 'uploading', progress: 10 });

      await repositorySaveAudioFile(songId, 'original', audioFile);
      console.log('[AddMusicForm] Step 2 done — audio saved locally');

      setUploadState({ phase: 'uploading', progress: 40 });

      // ── STEP 3: Queue for local processing ────────────────────────────────
      console.log('[AddMusicForm] Step 3: Queuing for local processing...');
      await queueSongForProcessing(songId);
      console.log('[AddMusicForm] Step 3 done — processing queued');

      setUploadState({ phase: 'uploading', progress: 60 });

      // ── STEP 4: If online, also save to Firebase (optional backup) ─────────
      let cloudSongId: string | null = null;
      if (isOnline()) {
        try {
          console.log('[AddMusicForm] Step 4: Online — also saving to Firebase...');
          cloudSongId = await addSong({
            title,
            artist,
            genre,
            youtubeUrl: youtubeUrl || undefined,
            notes: notes || undefined,
            status: 'queued',
          });

          await createProcessingJob(cloudSongId, 'audio_extraction');

          setUploadState({ phase: 'uploading', progress: 75 });

          const downloadUrl = await uploadAudioFile(
            cloudSongId,
            audioFile,
            'original',
            (pct) => {
              setUploadState({ phase: 'uploading', progress: 75 + Math.round(pct * 0.2) });
            }
          );

          const ext = audioFile.name.split('.').pop() ?? 'mp3';
          const originalAudioPath = `audio/${cloudSongId}/original.${ext}`;
          await updateSong(cloudSongId, { originalAudioPath });

          // Link local record to cloud
          const { repositoryUpdateSong } = await import('@/lib/songRepository');
          await repositoryUpdateSong(songId, {
            syncStatus: 'SYNCED',
            cloudSongId,
            localOnly: false,
            cloudSyncEnabled: true,
          });

          void downloadUrl;
          console.log('[AddMusicForm] Step 4 done — Firebase backup created, cloudSongId:', cloudSongId);
        } catch (cloudErr) {
          // Cloud backup failed — but local save succeeded. This is OK.
          console.warn('[AddMusicForm] Step 4: Firebase backup failed (non-fatal):', cloudErr);
          // Local data is safe — mark as sync pending for later
          const { repositoryUpdateSong } = await import('@/lib/songRepository');
          await repositoryUpdateSong(songId, { syncStatus: 'SYNC_PENDING' }).catch(() => {});
        }
      } else {
        console.log('[AddMusicForm] Step 4: Offline — skipping Firebase backup (will sync later)');
      }

      setUploadState({ phase: 'done', progress: 100 });
      setSavedSuccess(true);

      // Short delay to show success feedback before transitioning
      await new Promise((resolve) => setTimeout(resolve, 600));

      console.log('[AddMusicForm] All steps complete — calling onSubmit');
      onSubmit({ title, artist, genre, youtubeUrl, notes, songId });
    } catch (err: unknown) {
      console.error('[AddMusicForm] Save failed. songId was:', songId, '— error:', err);

      const errorMsg = err instanceof Error ? err.message : String(err);

      setSubmitError(
        `Não foi possível salvar a música localmente. Erro: ${errorMsg}`
      );

      setUploadState({ phase: 'error', progress: 0, errorMessage: errorMsg });
    } finally {
      console.log('[AddMusicForm] finally block — setting isSubmitting to false');
      setIsSubmitting(false);
    }
  }

  // ── Upload phase label ──────────────────────────────────────────────────────

  function getSubmitLabel(): React.ReactNode {
    if (!isSubmitting) {
      if (savedSuccess) return <><CircleCheck size={16} />Salvo!</>;
      return <>Enviar<ArrowRight size={16} /></>;
    }
    switch (uploadState.phase) {
      case 'preparing':
        return <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Preparando upload...</>;
      case 'uploading':
        return <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Enviando áudio {uploadState.progress}%</>;
      case 'done':
        return <><CircleCheck size={16} />Upload concluído!</>;
      default:
        return <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</>;
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 mb-6"
        >
          <ArrowLeft size={16} />
          Voltar para início
        </Link>

        <div className="flex items-center gap-4 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center flex-shrink-0">
            <Music2 size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Adicionar Música</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Preencha os dados e selecione o arquivo de áudio
            </p>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-3 mt-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-bold text-white">1</div>
            <span className="text-sm font-medium text-foreground">Dados da música</span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">2</div>
            <span className="text-sm text-muted-foreground">Processamento</span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">3</div>
            <span className="text-sm text-muted-foreground">Karaokê</span>
          </div>
        </div>
      </div>

      {/* Global error banner */}
      {submitError && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-6">
          <CircleAlert size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300">{submitError}</p>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="text-xs text-red-400/70 hover:text-red-300 mt-1 underline"
            >
              Fechar e tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Success banner */}
      {savedSuccess && (
        <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl mb-6">
          <CircleCheck size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-300">Áudio enviado com sucesso! Preparando o processamento...</p>
        </div>
      )}

      {/* Upload progress bar (visible during upload) */}
      {isSubmitting && uploadState.phase === 'uploading' && (
        <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-primary">Enviando áudio para o Firebase Storage...</span>
            <span className="text-xs font-mono text-primary">{uploadState.progress}%</span>
          </div>
          <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
            <div
              className="h-2 bg-gradient-primary rounded-full transition-all duration-300"
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Form card */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-card-elevated rounded-2xl p-6 sm:p-8 space-y-6">

          {/* Song title */}
          <div>
            <label htmlFor="title" className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
              <Music2 size={14} className="text-primary" />
              Nome da música
              <span className="text-accent text-xs">*</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Digite o título exato da música que você quer cantar
            </p>
            <input
              id="title"
              type="text"
              placeholder="Ex: Evidências"
              autoComplete="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full bg-input border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all duration-150 ${
                errors.title ? 'border-red-500/70 focus:ring-red-500/30' : 'border-border'
              }`}
            />
            {errors.title && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5">
                <CircleAlert size={12} />
                {errors.title}
              </p>
            )}
          </div>

          {/* Artist */}
          <div>
            <label htmlFor="artist" className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
              <Mic2 size={14} className="text-primary" />
              Artista / Banda
              <span className="text-accent text-xs">*</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Nome do artista ou banda que canta a música
            </p>
            <input
              id="artist"
              type="text"
              placeholder="Ex: Chitãozinho & Xororó"
              autoComplete="off"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className={`w-full bg-input border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all duration-150 ${
                errors.artist ? 'border-red-500/70 focus:ring-red-500/30' : 'border-border'
              }`}
            />
            {errors.artist && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5">
                <CircleAlert size={12} />
                {errors.artist}
              </p>
            )}
          </div>

          {/* Genre */}
          <div>
            <label htmlFor="genre" className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
              <Tag size={14} className="text-primary" />
              Gênero musical
              <span className="text-accent text-xs">*</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Selecione o gênero mais próximo para organizar sua biblioteca
            </p>
            <select
              id="genre"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className={`w-full bg-input border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all duration-150 appearance-none cursor-pointer ${
                errors.genre ? 'border-red-500/70 focus:ring-red-500/30' : 'border-border'
              }`}
            >
              <option value="" disabled className="text-muted-foreground">
                Selecione o gênero...
              </option>
              {genreOptions.map((g) => (
                <option key={g.key} value={g.value} className="bg-card text-foreground">
                  {g.label}
                </option>
              ))}
            </select>
            {errors.genre && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5">
                <CircleAlert size={12} />
                {errors.genre}
              </p>
            )}
          </div>

          {/* Audio file upload */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
              <Upload size={14} className="text-primary" />
              Arquivo de áudio
              <span className="text-accent text-xs">*</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Selecione o arquivo de áudio da música. Formatos aceitos: MP3, WAV, M4A (máx. {MAX_FILE_SIZE_LABEL})
            </p>

            {/* File selected state */}
            {audioFile ? (
              <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/30 rounded-xl">
                <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <File size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{audioFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  disabled={isSubmitting}
                  className="flex-shrink-0 w-7 h-7 rounded-full bg-muted/60 hover:bg-red-500/20 flex items-center justify-center transition-colors duration-150 disabled:opacity-40"
                  aria-label="Remover arquivo"
                >
                  <X size={14} className="text-muted-foreground hover:text-red-400" />
                </button>
              </div>
            ) : (
              /* Drop zone / select button */
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl transition-all duration-150 hover:border-primary/50 hover:bg-primary/5 ${
                  errors.audioFile ? 'border-red-500/50 bg-red-500/5' : 'border-border/60 bg-input/30'
                }`}
              >
                <Upload size={24} className={errors.audioFile ? 'text-red-400' : 'text-muted-foreground/60'} />
                <span className="text-sm font-medium text-muted-foreground">
                  Clique para selecionar o arquivo de áudio
                </span>
                <span className="text-xs text-muted-foreground/60">
                  MP3, WAV ou M4A — máx. {MAX_FILE_SIZE_LABEL}
                </span>
              </button>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
            />

            {errors.audioFile && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5">
                <CircleAlert size={12} />
                {errors.audioFile}
              </p>
            )}
          </div>

          {/* YouTube URL — future feature */}
          <div>
            <label htmlFor="youtubeUrl" className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
              <Video size={14} className="text-red-400" />
              URL do YouTube
              <span className="text-xs font-normal text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                Etapa futura
              </span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Cole o link do YouTube da música. O download automático será implementado em breve.
            </p>
            <input
              id="youtubeUrl"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className={`w-full bg-input/60 border border-dashed rounded-xl px-4 py-3 text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all duration-150 ${
                errors.youtubeUrl ? 'border-red-500/50' : 'border-border/60'
              }`}
            />
            {errors.youtubeUrl && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5">
                <CircleAlert size={12} />
                {errors.youtubeUrl}
              </p>
            )}
            {/* Future feature notice */}
            <div className="flex items-start gap-2 mt-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Info size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-300/80">
                <span className="font-semibold">Etapa futura:</span> O download automático do YouTube e a separação vocal por IA serão implementados em uma próxima versão do aplicativo.
              </p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
              <FileText size={14} className="text-primary" />
              Observações
              <span className="text-xs font-normal text-muted-foreground ml-1">(opcional)</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Notas pessoais sobre a música, tom preferido, etc.
            </p>
            <textarea
              id="notes"
              rows={3}
              placeholder="Ex: Versão ao vivo, tom mais grave..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-input border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all duration-150 resize-none"
            />
          </div>

          {/* Required fields note */}
          <p className="text-xs text-muted-foreground">
            <span className="text-accent">*</span> Campos obrigatórios
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between mt-6 gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 px-5 py-3 bg-muted/60 border border-border text-muted-foreground font-medium text-sm rounded-xl transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-95"
          >
            <ArrowLeft size={16} />
            Cancelar
          </Link>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-8 py-3 bg-gradient-primary text-white font-bold text-sm rounded-xl glow-primary transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:scale-100 min-w-[200px] justify-center"
          >
            {getSubmitLabel()}
          </button>
        </div>
      </form>
    </div>
  );
}