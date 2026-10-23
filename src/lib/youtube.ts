/**
 * ════════════════════════════════════════════════════════════════════════════
 * YOUTUBE KARAOKE — Busca de versões karaokê e leitura de links
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase 1: o app toca as versões karaokê direto do YouTube (player embutido).
 * Nada é baixado e nenhum servidor próprio é necessário.
 *
 * - Busca: YouTube Data API v3 (gratuita, exige chave em
 *   NEXT_PUBLIC_YOUTUBE_API_KEY). Cada busca custa 100 unidades da cota
 *   diária de 10.000 → ~100 buscas por dia. Resultados ficam em cache no
 *   aparelho por 24h para economizar cota.
 * - Sem chave: o usuário ainda pode colar um link do YouTube.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface YouTubeTrack {
  videoId: string;
  /** Título do vídeo como aparece no YouTube */
  videoTitle: string;
  /** Título da música (estimado a partir do título do vídeo) */
  title: string;
  /** Artista (estimado a partir do título do vídeo) */
  artist: string;
  channelTitle: string;
  thumbnailUrl: string;
}

export class YouTubeSearchError extends Error {
  constructor(
    message: string,
    public readonly kind: 'NO_KEY' | 'QUOTA' | 'BAD_KEY' | 'NETWORK' | 'UNKNOWN'
  ) {
    super(message);
    this.name = 'YouTubeSearchError';
  }
}

const API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY ?? '';
const SEARCH_CACHE_PREFIX = 'yt-search-cache:v1:';
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function hasYouTubeApiKey(): boolean {
  return API_KEY.trim().length > 0;
}

// ── Links ─────────────────────────────────────────────────────────────────────

/**
 * Extrai o ID do vídeo de qualquer formato comum de link do YouTube
 * (watch, youtu.be, shorts, embed, music.youtube.com) ou de um ID puro.
 */
export function extractYouTubeVideoId(input: string): string | null {
  const text = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;

  let url: URL;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      id = url.searchParams.get('v');
    } else {
      const match = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?]+)/);
      id = match ? match[2] : null;
    }
  }

  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// ── Título → música / artista ─────────────────────────────────────────────────

// Lookarounds com \p{L} em vez de \b: o \b do JavaScript não trata "ê", "ã" etc. como letra.
const W_START = '(?<![\\p{L}\\p{N}])';
const W_END = '(?![\\p{L}\\p{N}])';
const NOISE_WORDS =
  'karaok[eê](?:\\s+(?:version|vers[aã]o|com letra|with lyrics))?|instrumental(?:\\s+version)?|with lyrics|com letra|' +
  'lyrics?|letra|sing ?along|backing track|playback|official|oficial|version|vers[aã]o|hd|4k|mv|ao vivo|live';
const NOISE_PATTERNS = [
  // (Karaoke Version), [Instrumental], (Letra) …
  new RegExp(`[(\\[][^)\\]]*${W_START}(?:${NOISE_WORDS})${W_END}[^)\\]]*[)\\]]`, 'giu'),
  new RegExp(`${W_START}(?:${NOISE_WORDS})${W_END}`, 'giu'),
];

function cleanPart(text: string): string {
  let out = text;
  for (const p of NOISE_PATTERNS) out = out.replace(p, ' ');
  return out
    .replace(/[()[\]]/g, ' ')
    .replace(/[•–—]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-:,.]+|[\s\-:,.]+$/g, '')
    .trim();
}

const KARAOKE_CHANNEL = /kara(?:ok|fun)|videok|sing ?king|playback/i;

/**
 * Tenta separar "Artista - Música (Karaoke Version)" em artista e título.
 * Também lida com "Canal | Artista - Música". Quando não dá para saber o
 * artista, devolve artist vazio (a tela mostra o nome do canal).
 */
export function guessTitleAndArtist(videoTitle: string, channelTitle = ''): { title: string; artist: string } {
  const channel = channelTitle.trim().toLowerCase();
  const segments = videoTitle
    .split(/\s*[|│]\s*/)
    .map((seg) => seg.trim())
    .filter((seg) => seg && cleanPart(seg) && seg.toLowerCase() !== channel);
  const main = segments.find((seg) => /\s[-–—]\s/.test(seg)) ?? segments[0] ?? videoTitle;

  const parts = main
    .split(/\s+[-–—]\s+/)
    .map(cleanPart)
    .filter(Boolean);

  if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(' - ') };

  const title = parts[0] || cleanPart(videoTitle) || videoTitle;
  const artist = channelTitle && !KARAOKE_CHANNEL.test(channelTitle) ? channelTitle.trim() : '';
  return { title, artist };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// ── Busca ─────────────────────────────────────────────────────────────────────

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
}

function readCache(key: string): YouTubeTrack[] | null {
  try {
    const raw = localStorage.getItem(SEARCH_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; items: YouTubeTrack[] };
    if (Date.now() - parsed.at > SEARCH_CACHE_TTL_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCache(key: string, items: YouTubeTrack[]): void {
  try {
    localStorage.setItem(SEARCH_CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), items }));
  } catch {
    // Cache é só conveniência; falha não atrapalha a busca.
  }
}

/**
 * Busca versões karaokê no YouTube.
 * Só retorna vídeos que permitem ser tocados fora do YouTube (embeddable).
 */
export async function searchKaraokeVideos(query: string, opts: { addKaraokeWord?: boolean } = {}): Promise<YouTubeTrack[]> {
  const addKaraokeWord = opts.addKaraokeWord ?? true;
  const base = query.trim();
  if (!base) return [];
  if (!hasYouTubeApiKey()) {
    throw new YouTubeSearchError('Chave da API do YouTube não configurada.', 'NO_KEY');
  }

  const q = addKaraokeWord && !/karaok/i.test(base) ? `${base} karaoke` : base;
  const cacheKey = q.toLowerCase();
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '15',
    q,
    key: API_KEY,
  });

  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  } catch {
    throw new YouTubeSearchError('Sem conexão com o YouTube. Verifique a internet.', 'NETWORK');
  }

  if (!res.ok) {
    let reason = '';
    try {
      const body = await res.json();
      reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? '';
    } catch {
      // ignora corpo inválido
    }
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      throw new YouTubeSearchError(
        'A cota diária de buscas do YouTube acabou. Ela renova à meia-noite (horário do Pacífico). Enquanto isso, use as favoritas ou cole um link.',
        'QUOTA'
      );
    }
    if (res.status === 400 || res.status === 403) {
      throw new YouTubeSearchError(
        'A chave da API do YouTube foi recusada. Confira se ela está correta e se a "YouTube Data API v3" está ativada.',
        'BAD_KEY'
      );
    }
    throw new YouTubeSearchError(`Erro do YouTube (${res.status}).`, 'UNKNOWN');
  }

  const data = (await res.json()) as { items?: YouTubeSearchItem[] };
  const items: YouTubeTrack[] = (data.items ?? [])
    .filter((it) => it.id?.videoId)
    .map((it) => {
      const videoId = it.id!.videoId!;
      const videoTitle = decodeHtmlEntities(it.snippet?.title ?? '');
      const channelTitle = decodeHtmlEntities(it.snippet?.channelTitle ?? '');
      const thumbs = it.snippet?.thumbnails ?? {};
      const thumbnailUrl = thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? youtubeThumbnail(videoId);
      return { videoId, videoTitle, channelTitle, thumbnailUrl, ...guessTitleAndArtist(videoTitle, channelTitle) };
    });

  writeCache(cacheKey, items);
  return items;
}

/**
 * Monta uma faixa a partir de um link colado.
 * Tenta descobrir o título pelo oEmbed público do YouTube (não gasta cota).
 */
export async function trackFromLink(link: string): Promise<YouTubeTrack | null> {
  const videoId = extractYouTubeVideoId(link);
  if (!videoId) return null;

  let videoTitle = '';
  let channelTitle = '';
  const watchUrl = encodeURIComponent(youtubeWatchUrl(videoId));
  // O oEmbed do YouTube nem sempre libera acesso pelo navegador (CORS);
  // o noembed.com é um espelho público que libera. Tenta os dois.
  const oembedUrls = [
    `https://www.youtube.com/oembed?format=json&url=${watchUrl}`,
    `https://noembed.com/embed?url=${watchUrl}`,
  ];
  for (const oembedUrl of oembedUrls) {
    try {
      const res = await fetch(oembedUrl);
      if (!res.ok) continue;
      const body = (await res.json()) as { title?: string; author_name?: string; error?: string };
      if (body.error || !body.title) continue;
      videoTitle = body.title;
      channelTitle = body.author_name ?? '';
      break;
    } catch {
      // Tenta o próximo; sem título o vídeo ainda toca.
    }
  }

  const guessed = videoTitle
    ? guessTitleAndArtist(videoTitle, channelTitle)
    : { title: 'Vídeo do YouTube', artist: '' };

  return {
    videoId,
    videoTitle: videoTitle || guessed.title,
    channelTitle,
    thumbnailUrl: youtubeThumbnail(videoId),
    ...guessed,
  };
}
