/**
 * ════════════════════════════════════════════════════════════════════════════
 * SERVIÇO DO PC — cliente (Fase 2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Conversa com o pc-worker (Python) que roda no PC de casa e separa a voz.
 * Quando um trabalho fica pronto, baixa instrumental + voz e salva na
 * biblioteca do aparelho (IndexedDB) — depois toca sem PC e sem internet.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { localSaveSong, localUpdateSong, localGetAllSongs, localSaveAudioBlob, type LocalSong } from './localDB';

export type PcJobStatus = 'na_fila' | 'baixando' | 'separando' | 'pronto' | 'erro';

export interface PcJob {
  id: string;
  status: PcJobStatus;
  progresso: number;
  mensagem: string;
  origem: string;
  video_id: string;
  titulo: string;
  artista: string;
  duracao: number | null;
  criado_em: number;
  atualizado_em: number;
  tem_instrumental: boolean;
  tem_vocal: boolean;
}

export interface PcHealth {
  ok: boolean;
  versao: string;
  ffmpeg: boolean;
  yt_dlp: boolean;
  demucs: boolean;
  gpu: boolean;
  modelo: string;
}

const ADDRESS_KEY = 'karaoke-pc-worker-address:v1';
const DEFAULT_PORT = 8765;

/** Endereço salvo ou, por padrão, o mesmo computador que serve o app. */
export function getPcAddress(): string {
  try {
    const saved = localStorage.getItem(ADDRESS_KEY);
    if (saved) return saved;
  } catch {
    // sem armazenamento: usa o padrão
  }
  const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
  return `http://${host}:${DEFAULT_PORT}`;
}

/** Aceita "192.168.0.10", "192.168.0.10:8765" ou o endereço completo. */
export function normalizePcAddress(input: string): string {
  let text = input.trim().replace(/\/+$/, '');
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
  try {
    const url = new URL(text);
    if (!url.port && url.protocol === 'http:') url.port = String(DEFAULT_PORT);
    return url.origin;
  } catch {
    return '';
  }
}

export function setPcAddress(address: string): void {
  try {
    localStorage.setItem(ADDRESS_KEY, address);
  } catch {
    // ignora
  }
}

export class PcWorkerError extends Error {
  constructor(message: string, public readonly offline = false) {
    super(message);
    this.name = 'PcWorkerError';
  }
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${getPcAddress()}${path}`, { ...init, signal: controller.signal });
  } catch {
    const pageIsHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    throw new PcWorkerError(
      pageIsHttps
        ? 'Não consegui falar com o PC. Abra o app pelo endereço do PC (http://…:3000) para usar a separação.'
        : 'Não consegui falar com o PC. Confira se o iniciar.bat está aberto e se o aparelho está no mesmo Wi-Fi.',
      true
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let message = `Erro do serviço do PC (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.erro) message = body.erro;
    } catch {
      // corpo não é JSON
    }
    throw new PcWorkerError(message);
  }
  return (await res.json()) as T;
}

export function pcHealth(): Promise<PcHealth> {
  return call<PcHealth>('/saude', {}, 4000);
}

export async function pcListJobs(): Promise<PcJob[]> {
  const body = await call<{ trabalhos: PcJob[] }>('/trabalhos');
  return body.trabalhos;
}

export function pcCreateJobFromYouTube(input: {
  url: string;
  titulo?: string;
  artista?: string;
  videoId?: string;
}): Promise<PcJob> {
  return call<PcJob>('/trabalhos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: input.url, titulo: input.titulo, artista: input.artista, video_id: input.videoId }),
  });
}

export function pcCreateJobFromFile(file: File, titulo = '', artista = ''): Promise<PcJob> {
  return call<PcJob>(
    '/trabalhos/arquivo',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Nome-Arquivo': encodeURIComponent(file.name),
        'X-Titulo': encodeURIComponent(titulo),
        'X-Artista': encodeURIComponent(artista),
      },
      body: file,
    },
    5 * 60 * 1000
  );
}

export function pcRetryJob(id: string): Promise<PcJob> {
  return call<PcJob>(`/trabalhos/${id}/tentar-de-novo`, { method: 'POST' });
}

export async function pcDeleteJob(id: string): Promise<void> {
  await call<{ ok: boolean }>(`/trabalhos/${id}`, { method: 'DELETE' });
}

async function downloadStem(id: string, stem: 'instrumental' | 'vocal'): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
  try {
    const res = await fetch(`${getPcAddress()}/trabalhos/${id}/${stem}`, { signal: controller.signal });
    if (!res.ok) throw new PcWorkerError(`Não consegui baixar o arquivo "${stem}" do PC.`);
    return await res.blob();
  } catch (err) {
    if (err instanceof PcWorkerError) throw err;
    throw new PcWorkerError('A conexão com o PC caiu durante o download. Tente de novo.', true);
  } finally {
    clearTimeout(timer);
  }
}

/** Música da biblioteca que veio de um trabalho do PC (evita importar duas vezes). */
export async function findImportedSong(job: PcJob): Promise<LocalSong | null> {
  const all = await localGetAllSongs();
  return all.find((s) => s.pcJobId === job.id) ?? null;
}

/**
 * Baixa instrumental e voz do PC e salva como música da biblioteca.
 * Devolve o id local da música.
 */
export async function importJobToLibrary(job: PcJob): Promise<string> {
  const existing = await findImportedSong(job);
  if (existing?.localInstrumentalAudioKey) return existing.id;

  const instrumental = await downloadStem(job.id, 'instrumental');
  const vocal = job.tem_vocal ? await downloadStem(job.id, 'vocal').catch(() => null) : null;

  const title = job.titulo || 'Música separada no PC';
  const id =
    existing?.id ??
    (await localSaveSong({
      title,
      artist: job.artista || 'Desconhecido',
      genre: 'Karaokê',
      youtubeUrl: job.origem.startsWith('http') ? job.origem : undefined,
      sourceType: 'local-audio',
      sourceVideoId: job.video_id || undefined,
      thumbnailUrl: job.video_id ? `https://i.ytimg.com/vi/${job.video_id}/hqdefault.jpg` : undefined,
      pcJobId: job.id,
      duration: job.duracao ? formatDuration(job.duracao) : undefined,
      processingStatus: 'PROCESSING',
      syncStatus: 'LOCAL_ONLY',
      cloudSyncEnabled: false,
      localOnly: true,
    }));

  const instrumentalKey = await localSaveAudioBlob(
    id,
    'instrumental',
    new File([instrumental], 'instrumental.mp3', { type: 'audio/mpeg' })
  );
  const updates: Partial<LocalSong> = {
    localInstrumentalAudioKey: instrumentalKey,
    processingStatus: 'DONE',
  };
  if (vocal) {
    updates.localVocalsAudioKey = await localSaveAudioBlob(
      id,
      'vocals',
      new File([vocal], 'vocal.mp3', { type: 'audio/mpeg' })
    );
  }
  await localUpdateSong(id, updates);
  return id;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
