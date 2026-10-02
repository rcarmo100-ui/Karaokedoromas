'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  Download,
  Play,
  Pause,
  Volume2,
  Mic,
  Music2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  HardDrive,
  Cpu,
  FileAudio,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExecutionProvider = 'webgpu' | 'wasm' | null;
type ModelStatus = 'not-downloaded' | 'downloading' | 'available' | 'error';
type ProcessingStatus = 'idle' | 'processing' | 'done' | 'error';

interface AudioInfo {
  name: string;
  sizeMB: number;
  durationSec: number | null;
  file: File;
}

interface StemResult {
  label: string;
  blob: Blob;
  url: string;
}

interface DiagInfo {
  browser: string;
  webgpuAvailable: boolean;
  executionProvider: ExecutionProvider;
  modelCached: boolean;
  audioInfo: AudioInfo | null;
  processingTimeSec: number | null;
  status: ProcessingStatus;
  errorMessage: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL_NAME = 'UVR-MDX-NET-Inst_HQ_3';
const MODEL_SIZE_MB = 64;
const MODEL_CACHE_KEY = 'audio-ai-poc-model-v1';
const MODEL_URL =
  'https://huggingface.co/Politrees/UVR_resources/resolve/main/models/MDXNet/UVR-MDX-NET-Inst_HQ_3.onnx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBrowserName(): string {
  if (typeof navigator === 'undefined') return 'Desconhecido';
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('Chrome/')) return 'Google Chrome';
  if (ua.includes('Firefox/')) return 'Mozilla Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Apple Safari';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  return 'Outro';
}

async function detectWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  try {
    const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function getAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

// ─── Model Cache (Cache API) ──────────────────────────────────────────────────

async function isModelCached(): Promise<boolean> {
  try {
    const cache = await caches.open(MODEL_CACHE_KEY);
    const resp = await cache.match(MODEL_URL);
    return resp !== undefined;
  } catch {
    return false;
  }
}

async function downloadModelWithProgress(
  onProgress: (pct: number, loadedMB: number) => void
): Promise<ArrayBuffer> {
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : MODEL_SIZE_MB * 1024 * 1024;
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const pct = Math.min(100, Math.round((received / total) * 100));
    onProgress(pct, received / (1024 * 1024));
  }

  const buffer = new ArrayBuffer(received);
  const view = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.length;
  }

  // Cache the model
  try {
    const cache = await caches.open(MODEL_CACHE_KEY);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    await cache.put(MODEL_URL, new Response(blob));
  } catch {
    // Cache failure is non-fatal
  }

  return buffer;
}

async function getModelBuffer(): Promise<ArrayBuffer> {
  try {
    const cache = await caches.open(MODEL_CACHE_KEY);
    const resp = await cache.match(MODEL_URL);
    if (resp) {
      return await resp.arrayBuffer();
    }
  } catch {
    // fall through
  }
  throw new Error('Modelo não encontrado no cache. Faça o download primeiro.');
}

// ─── Audio Processing ─────────────────────────────────────────────────────────

async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 44100 });
  try {
    return await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    // keep context alive for later use
  }
}

function audioBufferToFloat32(buffer: AudioBuffer): Float32Array {
  // Mix down to mono
  const length = buffer.length;
  const result = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      result[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return result;
}

function float32ToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// ─── Mini Audio Player Component ─────────────────────────────────────────────

interface MiniPlayerProps {
  url: string;
  label: string;
  icon: React.ReactNode;
  accentClass: string;
}

function MiniPlayer({ url, label, icon, accentClass }: MiniPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      a.play().catch(() => {});
    }
    setPlaying(!playing);
  };

  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    setProgress(a.currentTime / a.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const val = parseFloat(e.target.value);
    a.currentTime = val * a.duration;
    setProgress(val);
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`${accentClass}`}>{icon}</span>
        <span className="font-semibold text-sm text-foreground">{label}</span>
      </div>
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className={`p-2 rounded-full ${accentClass} bg-primary/10 hover:bg-primary/20 transition-colors`}
          aria-label={playing ? 'Pausar' : 'Reproduzir'}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={handleSeek}
          className="flex-1 h-1.5 accent-primary cursor-pointer"
          aria-label="Posição"
        />
        <span className="text-xs text-muted-foreground font-mono w-10 text-right">
          {duration > 0 ? formatDuration(progress * duration) : '0:00'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Volume2 size={14} className="text-muted-foreground" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolume}
          className="w-24 h-1.5 accent-primary cursor-pointer"
          aria-label="Volume"
        />
        <span className="text-xs text-muted-foreground font-mono">{Math.round(volume * 100)}%</span>
      </div>
    </div>
  );
}

// ─── Main POC Page ────────────────────────────────────────────────────────────

export default function AudioAIPocPage() {
  // Detection state
  const [webgpuAvailable, setWebgpuAvailable] = useState<boolean | null>(null);
  const [executionProvider, setExecutionProvider] = useState<ExecutionProvider>(null);
  const [browserName, setBrowserName] = useState('');

  // Model state
  const [modelStatus, setModelStatus] = useState<ModelStatus>('not-downloaded');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedMB, setDownloadedMB] = useState(0);
  const [modelError, setModelError] = useState<string | null>(null);

  // Audio state
  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Processing state
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  const [processingTimeSec, setProcessingTimeSec] = useState<number | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Results
  const [stems, setStems] = useState<StemResult[]>([]);

  // Diagnostics panel
  const [diagOpen, setDiagOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessing = processingStatus === 'processing';

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    setBrowserName(getBrowserName());
    detectWebGPU().then((ok) => {
      setWebgpuAvailable(ok);
      setExecutionProvider(ok ? 'webgpu' : 'wasm');
    });
    isModelCached().then((cached) => {
      if (cached) setModelStatus('available');
    });
  }, []);

  // ── Model Download ────────────────────────────────────────────────────────

  const handleDownloadModel = useCallback(async () => {
    setModelStatus('downloading');
    setModelError(null);
    setDownloadProgress(0);
    setDownloadedMB(0);
    try {
      await downloadModelWithProgress((pct, mb) => {
        setDownloadProgress(pct);
        setDownloadedMB(mb);
      });
      setModelStatus('available');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setModelError(msg);
      setModelStatus('error');
    }
  }, []);

  // ── File Selection ────────────────────────────────────────────────────────

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioError(null);
    setStems([]);
    setProcessingStatus('idle');
    setProcessingLog([]);
    setProcessingTimeSec(null);
    setProcessingError(null);

    const sizeMB = file.size / (1024 * 1024);
    const durationSec = await getAudioDuration(file);
    setAudioInfo({ name: file.name, sizeMB, durationSec, file });
  }, []);

  // ── Processing ────────────────────────────────────────────────────────────

  const addLog = (msg: string) => setProcessingLog((prev) => [...prev, msg]);

  const handleSeparate = useCallback(async () => {
    if (!audioInfo || modelStatus !== 'available' || isProcessing) return;

    setProcessingStatus('processing');
    setProcessingLog([]);
    setProcessingError(null);
    setStems([]);
    const startTime = performance.now();

    try {
      addLog('Carregando onnxruntime-web…');
      // Dynamic import to avoid SSR issues
      const ort = await import('onnxruntime-web');

      // Configure execution providers
      const providers: string[] = [];
      if (webgpuAvailable) {
        providers.push('webgpu');
        addLog('Tentando WebGPU…');
      }
      providers.push('wasm');

      addLog('Carregando modelo do cache…');
      const modelBuffer = await getModelBuffer();

      addLog('Criando sessão ONNX…');
      let session: InstanceType<typeof ort.InferenceSession>;
      let usedProvider: ExecutionProvider = null;

      try {
        session = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: providers,
        });
        usedProvider = webgpuAvailable ? 'webgpu' : 'wasm';
        addLog(`Sessão criada com: ${usedProvider === 'webgpu' ? 'WebGPU' : 'WASM/CPU'}`);
      } catch (gpuErr) {
        if (webgpuAvailable) {
          addLog(`WebGPU falhou: ${gpuErr instanceof Error ? gpuErr.message : String(gpuErr)}`);
          addLog('Tentando WASM/CPU como fallback…');
          session = await ort.InferenceSession.create(modelBuffer, {
            executionProviders: ['wasm'],
          });
          usedProvider = 'wasm';
          addLog('Sessão criada com: WASM/CPU');
        } else {
          throw gpuErr;
        }
      }

      setExecutionProvider(usedProvider);

      addLog('Decodificando áudio…');
      const audioBuffer = await decodeAudioFile(audioInfo.file);
      const mono = audioBufferToFloat32(audioBuffer);
      const sampleRate = audioBuffer.sampleRate;

      addLog(`Áudio: ${mono.length} amostras @ ${sampleRate}Hz`);
      addLog('Executando inferência ONNX…');

      // Prepare input tensor — shape [1, 1, N] (batch, channels, samples)
      const inputTensor = new ort.Tensor('float32', mono, [1, 1, mono.length]);
      const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {};

      // Get input name from model
      const inputName = session.inputNames[0];
      feeds[inputName] = inputTensor;

      const results = await session.run(feeds);

      addLog('Inferência concluída. Extraindo stems…');

      // Output names: typically [vocals, instrumental] or [instrumental, vocals]
      const outputNames = session.outputNames;
      const stemBlobs: StemResult[] = [];

      for (let i = 0; i < outputNames.length; i++) {
        const name = outputNames[i];
        const tensor = results[name];
        const data = tensor.data as Float32Array;
        const blob = float32ToWavBlob(data, sampleRate);
        const url = URL.createObjectURL(blob);
        const label = name.toLowerCase().includes('vocal')
          ? 'Vocal' : name.toLowerCase().includes('inst') || i === 0
          ? 'Instrumental'
          : `Stem ${i + 1}`;
        stemBlobs.push({ label, blob, url });
      }

      // If model outputs only 1 stem (instrumental mask), derive vocal by subtraction
      if (stemBlobs.length === 1) {
        addLog('Modelo retornou 1 stem. Derivando vocal por subtração…');
        const instData = (results[outputNames[0]].data as Float32Array);
        const vocalData = new Float32Array(mono.length);
        for (let i = 0; i < mono.length; i++) {
          vocalData[i] = mono[i] - (instData[i] ?? 0);
        }
        const vocalBlob = float32ToWavBlob(vocalData, sampleRate);
        const vocalUrl = URL.createObjectURL(vocalBlob);
        stemBlobs.push({ label: 'Vocal', blob: vocalBlob, url: vocalUrl });
      }

      const elapsed = (performance.now() - startTime) / 1000;
      setProcessingTimeSec(elapsed);
      setStems(stemBlobs);
      setProcessingStatus('done');
      addLog(`Concluído em ${elapsed.toFixed(1)}s`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProcessingError(msg);
      setProcessingStatus('error');
      addLog(`ERRO: ${msg}`);
    }
  }, [audioInfo, modelStatus, isProcessing, webgpuAvailable]);

  // ── Download Result ───────────────────────────────────────────────────────

  const downloadStem = (stem: StemResult) => {
    const a = document.createElement('a');
    a.href = stem.url;
    a.download = `${stem.label.toLowerCase()}.wav`;
    a.click();
  };

  // ── Derived diag ─────────────────────────────────────────────────────────

  const diagInfo: DiagInfo = {
    browser: browserName,
    webgpuAvailable: webgpuAvailable ?? false,
    executionProvider,
    modelCached: modelStatus === 'available',
    audioInfo,
    processingTimeSec,
    status: processingStatus,
    errorMessage: processingError ?? modelError ?? audioError,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

          {/* ── Header ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                POC
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {executionProvider === 'webgpu' ? '⚡ WebGPU' : executionProvider === 'wasm' ? '🖥 WASM/CPU' : '…'}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              POC — Separação Vocal Local
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Teste de separação Vocal / Instrumental executado diretamente neste navegador.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2">
                <CheckCircle2 size={13} />
                Seu áudio não é enviado para um servidor. O processamento acontece neste dispositivo.
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                <Info size={13} />
                Esta é uma prova de conceito. Os resultados ainda não são integrados à biblioteca do Karaokê.
              </div>
            </div>
          </div>

          {/* ── Execution Provider Badge ── */}
          <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cpu size={18} className="text-primary" />
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Execution Provider</p>
                <p className="font-semibold text-sm text-foreground">
                  {webgpuAvailable === null
                    ? 'Detectando…'
                    : webgpuAvailable
                    ? '⚡ WebGPU' :'🖥 WASM / CPU'}
                </p>
              </div>
            </div>
            {webgpuAvailable === false && (
              <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2 py-1">
                WebGPU indisponível
              </span>
            )}
            {webgpuAvailable === true && (
              <span className="text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-2 py-1">
                WebGPU disponível
              </span>
            )}
          </div>

          {/* ── Model Section ── */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <HardDrive size={18} className="text-primary" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Modelo</p>
                <p className="font-semibold text-sm text-foreground">{MODEL_NAME}</p>
                <p className="text-xs text-muted-foreground">~{MODEL_SIZE_MB} MB · separação 2-stem</p>
              </div>
              <div>
                {modelStatus === 'not-downloaded' && (
                  <span className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg px-2 py-1">
                    Não baixado
                  </span>
                )}
                {modelStatus === 'available' && (
                  <span className="text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-2 py-1">
                    ✓ Disponível localmente
                  </span>
                )}
                {modelStatus === 'downloading' && (
                  <span className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-2 py-1">
                    Baixando…
                  </span>
                )}
                {modelStatus === 'error' && (
                  <span className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-2 py-1">
                    Erro
                  </span>
                )}
              </div>
            </div>

            {modelStatus === 'downloading' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>{downloadProgress}%</span>
                  <span>{downloadedMB.toFixed(1)} / ~{MODEL_SIZE_MB} MB</span>
                </div>
                <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {modelError && (
              <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span className="font-mono break-all">{modelError}</span>
              </div>
            )}

            {(modelStatus === 'not-downloaded' || modelStatus === 'error') && (
              <button
                onClick={handleDownloadModel}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                Baixar modelo (~{MODEL_SIZE_MB} MB)
              </button>
            )}
          </div>

          {/* ── Audio Selection ── */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <FileAudio size={18} className="text-primary" />
              <p className="font-semibold text-sm text-foreground">Selecionar música</p>
            </div>
            <p className="text-xs text-muted-foreground">Aceita MP3, WAV, M4A (decodificação pelo navegador)</p>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/m4a,.mp3,.wav,.m4a"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              Clique para selecionar arquivo de áudio
            </button>

            {audioInfo && (
              <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium text-foreground truncate">{audioInfo.name}</p>
                <div className="flex gap-4 text-xs text-muted-foreground font-mono">
                  <span>{audioInfo.sizeMB.toFixed(2)} MB</span>
                  {audioInfo.durationSec !== null && (
                    <span>{formatDuration(audioInfo.durationSec)}</span>
                  )}
                </div>
              </div>
            )}

            {audioError && (
              <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>{audioError}</span>
              </div>
            )}
          </div>

          {/* ── Separate Button ── */}
          <button
            onClick={handleSeparate}
            disabled={!audioInfo || modelStatus !== 'available' || isProcessing}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processando localmente…
              </>
            ) : (
              <>
                <Music2 size={16} />
                Separar Vocal e Instrumental
              </>
            )}
          </button>

          {/* ── Processing Log ── */}
          {processingLog.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Log de processamento</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {processingLog.map((line, i) => (
                  <p key={i} className="text-xs font-mono text-foreground/80">
                    {line.startsWith('ERRO') ? (
                      <span className="text-red-400">{line}</span>
                    ) : (
                      line
                    )}
                  </p>
                ))}
              </div>
              {processingTimeSec !== null && (
                <div className="pt-2 border-t border-border flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Tempo de processamento:</span>
                  <span className="text-foreground font-semibold">{processingTimeSec.toFixed(1)}s</span>
                </div>
              )}
              {processingStatus === 'done' && executionProvider && (
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Método:</span>
                  <span className="text-primary font-semibold">
                    {executionProvider === 'webgpu' ? 'WebGPU' : 'WASM / CPU'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Processing Error ── */}
          {processingError && (
            <div className="flex items-start gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl p-4">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">Erro no processamento</p>
                <p className="text-xs font-mono break-all">{processingError}</p>
              </div>
            </div>
          )}

          {/* ── Results ── */}
          {stems.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <p className="font-semibold text-sm text-foreground">Resultados</p>
              </div>
              {stems.map((stem) => (
                <div key={stem.label} className="space-y-2">
                  <MiniPlayer
                    url={stem.url}
                    label={stem.label}
                    icon={
                      stem.label === 'Vocal' ? (
                        <Mic size={16} />
                      ) : (
                        <Music2 size={16} />
                      )
                    }
                    accentClass={stem.label === 'Vocal' ? 'text-violet-400' : 'text-sky-400'}
                  />
                  <button
                    onClick={() => downloadStem(stem)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                  >
                    <Download size={13} />
                    Baixar {stem.label.toLowerCase()}.wav
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Diagnostics Panel ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setDiagOpen((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-foreground hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Info size={15} className="text-primary" />
                Informações técnicas
              </div>
              {diagOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {diagOpen && (
              <div className="border-t border-border px-5 py-4 space-y-2">
                {(
                  [
                    ['Browser', diagInfo.browser || '…'],
                    ['WebGPU', diagInfo.webgpuAvailable ? 'Disponível' : 'Indisponível'],
                    [
                      'Execution Provider',
                      diagInfo.executionProvider === 'webgpu' ?'WebGPU'
                        : diagInfo.executionProvider === 'wasm' ?'WASM / CPU' :'…',
                    ],
                    ['Modelo', MODEL_NAME],
                    ['Modelo em cache', diagInfo.modelCached ? 'Sim' : 'Não'],
                    ['Arquivo', diagInfo.audioInfo?.name ?? '—'],
                    [
                      'Tamanho',
                      diagInfo.audioInfo ? `${diagInfo.audioInfo.sizeMB.toFixed(2)} MB` : '—',
                    ],
                    [
                      'Duração',
                      diagInfo.audioInfo?.durationSec != null
                        ? formatDuration(diagInfo.audioInfo.durationSec)
                        : '—',
                    ],
                    [
                      'Tempo de processamento',
                      diagInfo.processingTimeSec != null
                        ? `${diagInfo.processingTimeSec.toFixed(1)}s`
                        : '—',
                    ],
                    [
                      'Status',
                      {
                        idle: 'Pronto',
                        processing: 'Processando',
                        done: 'Concluído',
                        error: 'Erro',
                      }[diagInfo.status],
                    ],
                  ] as [string, string][]
                ).map(([key, val]) => (
                  <div key={key} className="flex items-start justify-between gap-4 text-xs">
                    <span className="text-muted-foreground font-mono shrink-0">{key}:</span>
                    <span
                      className={`font-mono text-right break-all ${
                        val === 'Disponível' || val === 'Sim' || val === 'Concluído'
                          ? 'text-emerald-400'
                          : val === 'Indisponível'|| val === 'Não' || val === 'Erro' ?'text-red-400'
                          : val === 'Processando' ?'text-amber-400' :'text-foreground'
                      }`}
                    >
                      {val}
                    </span>
                  </div>
                ))}

                {diagInfo.errorMessage && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs font-mono text-red-400 break-all">{diagInfo.errorMessage}</p>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
