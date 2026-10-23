/**
 * ════════════════════════════════════════════════════════════════════════════
 * LRCLIB — Letras sincronizadas gratuitas (https://lrclib.net)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Usado como opção quando o vídeo karaokê não mostra a letra na tela.
 * Atenção: o tempo da letra vem da gravação ORIGINAL. A versão karaokê
 * pode ter introdução diferente — por isso o player oferece ajuste de atraso.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface LyricLine {
  time: number; // segundos
  text: string;
}

export interface LyricsResult {
  source: 'lrclib';
  trackName: string;
  artistName: string;
  synced: LyricLine[] | null;
  plain: string | null;
}

interface LrclibRecord {
  trackName?: string;
  artistName?: string;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/** Converte texto LRC ("[01:23.45] linha") em linhas com tempo. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (stamps.length === 0) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const s of stamps) {
      const minutes = Number(s[1]);
      const seconds = Number(s[2].replace(':', '.'));
      if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
        lines.push({ time: minutes * 60 + seconds, text });
      }
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

async function lrclibSearch(params: Record<string, string>): Promise<LrclibRecord[]> {
  const res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams(params).toString()}`);
  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body) ? (body as LrclibRecord[]) : [];
}

function pickBest(records: LrclibRecord[]): LrclibRecord | null {
  const usable = records.filter((r) => !r.instrumental && (r.syncedLyrics || r.plainLyrics));
  return usable.find((r) => r.syncedLyrics) ?? usable[0] ?? null;
}

/**
 * Procura a letra pelo título e artista; se não achar, tenta uma busca livre.
 * Retorna null quando não encontra nada (não é erro).
 */
export async function fetchLyrics(title: string, artist: string): Promise<LyricsResult | null> {
  const t = title.trim();
  const a = artist.trim();
  if (!t) return null;

  let best: LrclibRecord | null = null;
  if (a) {
    best = pickBest(await lrclibSearch({ track_name: t, artist_name: a }));
  }
  if (!best) {
    best = pickBest(await lrclibSearch({ q: a ? `${a} ${t}` : t }));
  }
  if (!best) return null;

  return {
    source: 'lrclib',
    trackName: best.trackName ?? t,
    artistName: best.artistName ?? a,
    synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null,
    plain: best.plainLyrics ?? null,
  };
}

/** Índice da linha ativa para um tempo (já com o ajuste aplicado). */
export function activeLyricIndex(lines: LyricLine[], time: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (time >= lines[i].time) idx = i;
    else break;
  }
  return idx;
}
