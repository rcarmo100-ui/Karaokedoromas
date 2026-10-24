'use client';

/**
 * Tela "Cantar" — Fase 1 do Karaokê do Romas.
 * Busca a versão karaokê no YouTube, toca no player embutido,
 * mantém a fila da festa e as favoritas, e mostra a letra (opcional).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast, Toaster } from 'sonner';
import {
  Search,
  Play,
  ListPlus,
  Star,
  SkipForward,
  RotateCcw,
  Trash2,
  ChevronUp,
  ChevronDown,
  Mic2,
  Maximize2,
  Minimize2,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Link2,
  Minus,
  Plus,
  ListMusic,
  Square,
  Cpu,
  HardDrive,
} from 'lucide-react';
import YouTubeKaraokePlayer from '@/components/YouTubeKaraokePlayer';
import LocalKaraokePlayer from '@/components/LocalKaraokePlayer';
import PcPanel from '@/app/cantar/components/PcPanel';
import { useKaraokeQueue, type KaraokeQueueItem } from '@/hooks/useKaraokeQueue';
import { pcCreateJobFromYouTube } from '@/lib/pcWorker';
import {
  extractYouTubeVideoId,
  hasYouTubeApiKey,
  searchKaraokeVideos,
  trackFromLink,
  youtubeThumbnail,
  youtubeWatchUrl,
  YouTubeSearchError,
  type YouTubeTrack,
} from '@/lib/youtube';
import { fetchLyrics, activeLyricIndex, type LyricsResult } from '@/lib/lrclib';
import {
  repositoryGetAllSongs,
  repositoryGetSong,
  repositorySaveYouTubeFavorite,
  repositoryDeleteSongLocally,
  repositoryUpdateSong,
  type LocalSong,
} from '@/lib/songRepository';

type Tab = 'buscar' | 'fila' | 'favoritas' | 'pc';

/** Música separada no PC (instrumental salvo no aparelho) → item tocável */
function localSongToTrack(s: LocalSong): YouTubeTrack {
  const videoId = s.sourceVideoId ?? '';
  return {
    videoId,
    videoTitle: s.title,
    title: s.title,
    artist: s.artist === 'Desconhecido' ? '' : s.artist,
    channelTitle: 'Separada no PC',
    thumbnailUrl: s.thumbnailUrl ?? (videoId ? youtubeThumbnail(videoId) : ''),
  };
}

function isPcSong(s: LocalSong): boolean {
  return Boolean(s.localInstrumentalAudioKey) && !s.youtubeVideoId;
}

function favoriteToTrack(s: LocalSong): YouTubeTrack {
  const videoId = s.youtubeVideoId!;
  return {
    videoId,
    videoTitle: s.youtubeVideoTitle ?? s.title,
    title: s.title,
    // Quando o artista salvo é só o nome do canal, trata como desconhecido
    artist: s.artist === s.channelTitle ? '' : s.artist,
    channelTitle: s.channelTitle ?? '',
    thumbnailUrl: s.thumbnailUrl ?? youtubeThumbnail(videoId),
  };
}

export default function CantarClient() {
  const searchParams = useSearchParams();
  const queue = useKaraokeQueue();
  const { nowPlaying } = queue;

  const [tab, setTab] = useState<Tab>('buscar');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<YouTubeTrack[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [singer, setSinger] = useState('');
  const [searchOriginal, setSearchOriginal] = useState(false);
  const [pcRefresh, setPcRefresh] = useState(0);
  const [pcSongs, setPcSongs] = useState<LocalSong[]>([]);

  const [favorites, setFavorites] = useState<LocalSong[]>([]);
  const favoriteByVideo = useMemo(() => {
    const map = new Map<string, LocalSong>();
    favorites.forEach((f) => f.youtubeVideoId && map.set(f.youtubeVideoId, f));
    return map;
  }, [favorites]);

  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const [lyricsOn, setLyricsOn] = useState(false);
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [lyricsState, setLyricsState] = useState<'idle' | 'loading' | 'none' | 'ok'>('idle');
  const [lyricsOffset, setLyricsOffset] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const apiKeyOk = hasYouTubeApiKey();

  // ── Favoritas ──────────────────────────────────────────────────────────────
  const loadFavorites = useCallback(async () => {
    try {
      const all = await repositoryGetAllSongs();
      setFavorites(all.filter((s) => Boolean(s.youtubeVideoId)));
      setPcSongs(all.filter(isPcSong));
    } catch (err) {
      console.error('[Cantar] Falha ao carregar favoritas', err);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // ── Abrir pela URL (?localId= da biblioteca ou ?v= link) ───────────────────
  const handledParams = useRef(false);
  useEffect(() => {
    if (!queue.loaded || handledParams.current) return;
    handledParams.current = true;
    const localId = searchParams.get('localId');
    const v = searchParams.get('v');
    if (localId) {
      repositoryGetSong(localId).then((song) => {
        if (song?.youtubeVideoId) queue.playNow(favoriteToTrack(song), { localId: song.id });
        else if (song && isPcSong(song)) queue.playNow(localSongToTrack(song), { localId: song.id, kind: 'local' });
      });
    } else if (v) {
      trackFromLink(v).then((track) => track && queue.playNow(track));
    }
  }, [queue.loaded, searchParams, queue]);

  // ── Troca de música: limpa erro e tempo; carrega ajuste salvo ──────────────
  const nowKey = nowPlaying?.queueId ?? null;
  useEffect(() => {
    setPlayerError(null);
    setCurrentTime(0);
    const fav = nowPlaying ? favoriteByVideo.get(nowPlaying.track.videoId) : undefined;
    setLyricsOffset(fav?.lyricsOffset ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowKey]);

  // ── Letra ──────────────────────────────────────────────────────────────────
  // Busca de novo quando muda a música (arquivos enviados não têm vídeo)
  const lyricsKey = nowPlaying ? `${nowPlaying.track.title}|${nowPlaying.track.artist}` : null;
  useEffect(() => {
    if (!lyricsOn || !nowPlaying) {
      setLyrics(null);
      setLyricsState('idle');
      return;
    }
    let cancelled = false;
    setLyricsState('loading');
    fetchLyrics(nowPlaying.track.title, nowPlaying.track.artist)
      .then((res) => {
        if (cancelled) return;
        setLyrics(res);
        setLyricsState(res ? 'ok' : 'none');
      })
      .catch(() => {
        if (cancelled) return;
        setLyrics(null);
        setLyricsState('none');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyricsOn, lyricsKey]);

  const changeOffset = (delta: number | null) => {
    const value = delta === null ? 0 : Math.round((lyricsOffset + delta) * 10) / 10;
    setLyricsOffset(value);
    const fav = nowPlaying ? favoriteByVideo.get(nowPlaying.track.videoId) : undefined;
    if (fav) {
      repositoryUpdateSong(fav.id, { lyricsOffset: value }).catch(() => {});
      setFavorites((prev) => prev.map((f) => (f.id === fav.id ? { ...f, lyricsOffset: value } : f)));
    }
  };

  const syncedLines = lyrics?.synced ?? null;
  const lyricIdx = syncedLines ? activeLyricIndex(syncedLines, currentTime - lyricsOffset) : -1;

  // ── Busca ──────────────────────────────────────────────────────────────────
  const runSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = query.trim();
      if (!text) return;
      setSearchError(null);

      // Link colado: toca/adiciona direto, sem gastar busca
      if (/youtu\.?be/i.test(text) && extractYouTubeVideoId(text)) {
        setSearching(true);
        const track = await trackFromLink(text);
        setSearching(false);
        if (track) {
          setResults([track]);
        } else {
          setSearchError('Não reconheci esse link do YouTube.');
        }
        return;
      }

      if (!apiKeyOk) {
        setSearchError('A busca precisa da chave da API do YouTube. Enquanto isso, cole o link do vídeo aqui.');
        return;
      }

      setSearching(true);
      try {
        const items = await searchKaraokeVideos(text, { addKaraokeWord: !searchOriginal });
        setResults(items);
        if (items.length === 0) {
          setSearchError(
            searchOriginal ? 'Nada encontrado. Tente outro nome.' : 'Nenhuma versão karaokê encontrada. Tente outro nome.'
          );
        }
      } catch (err) {
        setResults([]);
        setSearchError(err instanceof YouTubeSearchError ? err.message : 'Erro ao buscar no YouTube.');
      } finally {
        setSearching(false);
      }
    },
    [query, apiKeyOk, searchOriginal]
  );

  // ── Ações ──────────────────────────────────────────────────────────────────
  const extraFor = (track: YouTubeTrack) => ({
    singer: singer.trim() || undefined,
    localId: favoriteByVideo.get(track.videoId)?.id,
  });

  const handlePlayNow = (track: YouTubeTrack) => {
    queue.playNow(track, extraFor(track));
  };

  const handleEnqueue = (track: YouTubeTrack) => {
    queue.enqueue(track, extraFor(track));
    toast.success(nowPlaying ? 'Adicionada à fila' : 'Tocando agora', { description: track.title });
  };

  const toggleFavorite = async (track: YouTubeTrack) => {
    const fav = favoriteByVideo.get(track.videoId);
    try {
      if (fav) {
        await repositoryDeleteSongLocally(fav.id);
        toast('Removida das favoritas', { description: track.title });
      } else {
        await repositorySaveYouTubeFavorite(track);
        toast.success('Salva nas favoritas', { description: track.title });
      }
      await loadFavorites();
    } catch {
      toast.error('Não foi possível salvar. Tente de novo.');
    }
  };

  const playLocal = useCallback(
    async (localId: string, mode: 'now' | 'queue' = 'now') => {
      const song = await repositoryGetSong(localId);
      if (!song || !isPcSong(song)) {
        toast.error('Música não encontrada neste aparelho.');
        return;
      }
      const extra = { localId: song.id, kind: 'local' as const, singer: singer.trim() || undefined };
      if (mode === 'now') queue.playNow(localSongToTrack(song), extra);
      else {
        queue.enqueue(localSongToTrack(song), extra);
        toast.success(nowPlaying ? 'Adicionada à fila' : 'Tocando agora', { description: song.title });
      }
    },
    [queue, singer, nowPlaying]
  );

  const sendToPc = async (track: YouTubeTrack) => {
    try {
      await pcCreateJobFromYouTube({
        url: youtubeWatchUrl(track.videoId),
        titulo: track.title,
        artista: track.artist,
        videoId: track.videoId,
      });
      toast.success('Enviada para o PC separar a voz', { description: track.title });
      setPcRefresh((n) => n + 1);
      setTab('pc');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não consegui enviar para o PC.');
    }
  };

  const guideSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGuideLevel = (level: number) => {
    const localId = nowPlaying?.localId;
    if (!localId) return;
    if (guideSaveTimer.current) clearTimeout(guideSaveTimer.current);
    guideSaveTimer.current = setTimeout(() => {
      repositoryUpdateSong(localId, { vocalGuideLevel: level }).catch(() => {});
      setPcSongs((prev) => prev.map((s) => (s.id === localId ? { ...s, vocalGuideLevel: level } : s)));
    }, 600);
  };

  const handleEnded = useCallback(() => {
    queue.next();
  }, [queue]);

  const handlePlayerError = useCallback((_code: number, message: string) => {
    setPlayerError(message);
  }, []);

  // ── Tela cheia (player + letra) ────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      toast('Tela cheia não disponível neste aparelho. Use o botão de tela cheia do próprio vídeo.');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Toaster theme="dark" position="top-center" richColors />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── Palco: player + letra ───────────────────────────────────────── */}
        <section className="min-w-0">
          <div
            ref={stageRef}
            className={`bg-black rounded-2xl overflow-hidden border border-border flex flex-col ${
              isFullscreen ? 'rounded-none border-0 h-screen' : ''
            }`}
          >
            <div className={`relative w-full ${isFullscreen ? 'flex-1 min-h-0' : 'aspect-video'}`}>
              {nowPlaying?.kind === 'local' && nowPlaying.localId ? (
                <LocalKaraokePlayer
                  localId={nowPlaying.localId}
                  playKey={nowPlaying.queueId}
                  title={nowPlaying.track.title}
                  initialGuideLevel={pcSongs.find((s) => s.id === nowPlaying.localId)?.vocalGuideLevel ?? 0}
                  onEnded={handleEnded}
                  onTime={setCurrentTime}
                  onError={(msg) => setPlayerError(msg)}
                  onGuideLevelChange={saveGuideLevel}
                  className="absolute inset-0"
                />
              ) : (
                <YouTubeKaraokePlayer
                  videoId={nowPlaying?.track.videoId ?? null}
                  playKey={nowPlaying?.queueId ?? null}
                  onEnded={handleEnded}
                  onError={handlePlayerError}
                  onTime={setCurrentTime}
                  onLoadError={(msg) => setPlayerError(msg)}
                  className="absolute inset-0"
                />
              )}
              {!nowPlaying && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-center px-6 bg-gradient-to-br from-primary/20 via-black to-accent/20">
                  <Mic2 size={40} className="text-primary" />
                  <p className="text-lg font-semibold">Escolha uma música para começar</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Busque pelo nome da música ou do artista. O app procura a versão karaokê no YouTube.
                  </p>
                </div>
              )}
              {playerError && nowPlaying && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 text-center px-6 bg-black/85">
                  <AlertTriangle size={36} className="text-yellow-400" />
                  <p className="font-semibold max-w-md">{playerError}</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <button
                      onClick={() => queue.next()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
                    >
                      <SkipForward size={16} /> {queue.upcoming.length ? 'Próxima da fila' : 'Fechar'}
                    </button>
                    {nowPlaying.track.videoId && nowPlaying.kind !== 'local' && (
                      <a
                        href={youtubeWatchUrl(nowPlaying.track.videoId)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-sm"
                      >
                        <ExternalLink size={16} /> Abrir no YouTube
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Letra */}
            {lyricsOn && nowPlaying && (
              <div className={`px-4 py-4 text-center bg-black ${isFullscreen ? 'pb-8' : ''}`}>
                {lyricsState === 'loading' && (
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Procurando a letra…
                  </p>
                )}
                {lyricsState === 'none' && (
                  <p className="text-sm text-muted-foreground">Letra não encontrada para esta música.</p>
                )}
                {lyricsState === 'ok' && syncedLines && (
                  <div className={isFullscreen ? 'space-y-2' : 'space-y-1'}>
                    <p
                      className={`font-bold text-primary leading-snug ${
                        isFullscreen ? 'text-3xl sm:text-5xl' : 'text-xl sm:text-2xl'
                      }`}
                      style={{ textShadow: '0 0 20px rgba(168,85,247,0.45)' }}
                    >
                      {lyricIdx >= 0 ? syncedLines[lyricIdx].text || '♪' : '♪ ♪ ♪'}
                    </p>
                    <p className={`text-muted-foreground ${isFullscreen ? 'text-xl sm:text-3xl' : 'text-base sm:text-lg'}`}>
                      {syncedLines[lyricIdx + 1]?.text ?? ''}
                    </p>
                  </div>
                )}
                {lyricsState === 'ok' && !syncedLines && lyrics?.plain && (
                  <div className="max-h-48 overflow-y-auto text-left whitespace-pre-line text-sm text-muted-foreground">
                    <p className="text-xs mb-2 text-yellow-400/80">Letra sem tempo sincronizado:</p>
                    {lyrics.plain}
                  </div>
                )}
                {lyricsState === 'ok' && syncedLines && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <span>Letra adiantada/atrasada?</span>
                    <button onClick={() => changeOffset(-0.5)} className="p-1.5 rounded-lg bg-muted/60" aria-label="Adiantar letra">
                      <Minus size={12} />
                    </button>
                    <span className="font-mono-nums w-14 text-center">
                      {lyricsOffset > 0 ? '+' : ''}
                      {lyricsOffset.toFixed(1)}s
                    </span>
                    <button onClick={() => changeOffset(0.5)} className="p-1.5 rounded-lg bg-muted/60" aria-label="Atrasar letra">
                      <Plus size={12} />
                    </button>
                    {lyricsOffset !== 0 && (
                      <button onClick={() => changeOffset(null)} className="underline">
                        zerar
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tocando agora + controles */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              {nowPlaying ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-primary font-semibold">
                    Tocando agora{nowPlaying.singer ? ` · ${nowPlaying.singer} canta` : ''}
                  </p>
                  <p className="font-semibold truncate">{nowPlaying.track.title}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {nowPlaying.track.artist || nowPlaying.track.channelTitle}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nada tocando.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ToolButton onClick={() => setLyricsOn((v) => !v)} active={lyricsOn} label="Letra">
                <Mic2 size={16} />
              </ToolButton>
              {nowPlaying && (
                <>
                  {nowPlaying.kind === 'local' ? (
                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-green-500/10 text-green-400">
                      <HardDrive size={16} /> No aparelho
                    </span>
                  ) : (
                  <ToolButton
                    onClick={() => toggleFavorite(nowPlaying.track)}
                    active={favoriteByVideo.has(nowPlaying.track.videoId)}
                    label="Favorita"
                  >
                    <Star size={16} fill={favoriteByVideo.has(nowPlaying.track.videoId) ? 'currentColor' : 'none'} />
                  </ToolButton>
                  )}
                  <ToolButton onClick={queue.replay} label="Repetir">
                    <RotateCcw size={16} />
                  </ToolButton>
                  <ToolButton onClick={queue.next} label={queue.upcoming.length ? 'Próxima' : 'Parar'}>
                    {queue.upcoming.length ? <SkipForward size={16} /> : <Square size={16} />}
                  </ToolButton>
                </>
              )}
              <ToolButton onClick={toggleFullscreen} label="Tela cheia">
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </ToolButton>
            </div>
          </div>

          {/* Próximas (resumo) */}
          {queue.upcoming.length > 0 && (
            <button
              onClick={() => setTab('fila')}
              className="mt-3 w-full text-left text-sm text-muted-foreground bg-card-elevated rounded-xl px-4 py-3 hover:text-foreground transition-colors"
            >
              <span className="text-foreground font-medium">A seguir:</span> {queue.upcoming[0].track.title}
              {queue.upcoming[0].singer ? ` (${queue.upcoming[0].singer})` : ''}
              {queue.upcoming.length > 1 ? ` · +${queue.upcoming.length - 1} na fila` : ''}
            </button>
          )}
        </section>

        {/* ── Painel lateral: busca / fila / favoritas ──────────────────── */}
        <aside className="bg-card-elevated rounded-2xl p-4 min-w-0 lg:max-h-[calc(100vh-120px)] lg:overflow-hidden flex flex-col">
          <div className="grid grid-cols-4 gap-1 p-1 bg-muted/40 rounded-xl mb-4">
            <TabButton active={tab === 'buscar'} onClick={() => setTab('buscar')}>
              <Search size={14} /> Buscar
            </TabButton>
            <TabButton active={tab === 'fila'} onClick={() => setTab('fila')}>
              <ListMusic size={14} /> Fila{queue.upcoming.length ? ` (${queue.upcoming.length})` : ''}
            </TabButton>
            <TabButton active={tab === 'favoritas'} onClick={() => setTab('favoritas')}>
              <Star size={14} /> Salvas
            </TabButton>
            <TabButton active={tab === 'pc'} onClick={() => setTab('pc')}>
              <Cpu size={14} /> PC
            </TabButton>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
            {tab === 'buscar' && (
              <div>
                <form onSubmit={runSearch} className="flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={apiKeyOk ? 'Música ou artista (ou cole um link)' : 'Cole o link do YouTube'}
                    className="flex-1 min-w-0 bg-input border border-border rounded-xl px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    enterKeyHint="search"
                  />
                  <button
                    type="submit"
                    disabled={searching || !query.trim()}
                    className="px-4 rounded-xl bg-primary text-white disabled:opacity-50 flex items-center"
                    aria-label="Buscar"
                  >
                    {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                  </button>
                </form>

                <input
                  value={singer}
                  onChange={(e) => setSinger(e.target.value)}
                  placeholder="Quem vai cantar? (opcional)"
                  className="mt-2 w-full bg-input border border-border rounded-xl px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />

                {apiKeyOk && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={searchOriginal}
                      onChange={(e) => setSearchOriginal(e.target.checked)}
                      className="accent-primary"
                    />
                    Buscar a música original (para separar a voz no PC)
                  </label>
                )}

                {!apiKeyOk && (
                  <div className="mt-3 text-xs text-yellow-300/90 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 flex gap-2">
                    <Link2 size={14} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Busca pelo nome desligada: falta a chave da API do YouTube (veja docs/YOUTUBE_KARAOKE.md).
                      Por enquanto, cole o link de um vídeo karaokê.
                    </span>
                  </div>
                )}

                {searchError && <p className="mt-3 text-sm text-red-400">{searchError}</p>}

                <ul className="mt-3 space-y-2">
                  {results.map((track) => (
                    <TrackRow
                      key={track.videoId}
                      track={track}
                      isFavorite={favoriteByVideo.has(track.videoId)}
                      onPlay={() => handlePlayNow(track)}
                      onEnqueue={() => handleEnqueue(track)}
                      onFavorite={() => toggleFavorite(track)}
                      onSeparate={() => sendToPc(track)}
                    />
                  ))}
                </ul>
              </div>
            )}

            {tab === 'fila' && (
              <QueuePanel
                upcoming={queue.upcoming}
                onPlay={queue.playFromQueue}
                onRemove={queue.remove}
                onUp={queue.moveUp}
                onDown={queue.moveDown}
                onClear={queue.clearUpcoming}
              />
            )}

            {tab === 'favoritas' && (
              <div>
                {pcSongs.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <HardDrive size={12} /> Separadas no PC · tocam sem internet
                    </p>
                    <ul className="space-y-2">
                      {pcSongs.map((song) => (
                        <TrackRow
                          key={song.id}
                          track={localSongToTrack(song)}
                          onPlay={() => playLocal(song.id, 'now')}
                          onEnqueue={() => playLocal(song.id, 'queue')}
                        />
                      ))}
                    </ul>
                    {favorites.length > 0 && (
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mt-4 mb-2 flex items-center gap-1.5">
                        <Star size={12} /> Favoritas do YouTube
                      </p>
                    )}
                  </div>
                )}
                {favorites.length === 0 && pcSongs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Nenhuma favorita ainda. Toque na estrela de uma música para salvar aqui — tocar uma favorita não gasta busca.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {favorites.map((fav) => {
                      const track = favoriteToTrack(fav);
                      return (
                        <TrackRow
                          key={fav.id}
                          track={track}
                          isFavorite
                          onPlay={() => handlePlayNow(track)}
                          onEnqueue={() => handleEnqueue(track)}
                          onFavorite={() => toggleFavorite(track)}
                        />
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            {/* Mantém montado para seguir acompanhando o PC em segundo plano */}
            <div className={tab === 'pc' ? '' : 'hidden'}>
              <PcPanel
                active={tab === 'pc'}
                refreshToken={pcRefresh}
                onPlayLocal={(id) => playLocal(id, 'now')}
                onLibraryChanged={loadFavorites}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Componentes menores ───────────────────────────────────────────────────────

function ToolButton({
  children,
  onClick,
  label,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors ${
        active ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function TabButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
        active ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function TrackRow({
  track,
  isFavorite = false,
  onPlay,
  onEnqueue,
  onFavorite,
  onSeparate,
}: {
  track: YouTubeTrack;
  isFavorite?: boolean;
  onPlay: () => void;
  onEnqueue: () => void;
  onFavorite?: () => void;
  onSeparate?: () => void;
}) {
  return (
    <li className="flex gap-3 items-center rounded-xl p-2 hover:bg-muted/40 transition-colors">
      <button onClick={onPlay} className="relative flex-shrink-0 w-24 aspect-video rounded-lg overflow-hidden bg-muted group" aria-label="Cantar agora">
        {track.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-primary">
            <Mic2 size={18} />
          </span>
        )}
        <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <Play size={18} fill="white" className="text-white" />
        </span>
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight line-clamp-2" title={track.videoTitle}>
          {track.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {[track.artist, track.channelTitle].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ')}
        </p>
        <div className="mt-1.5 flex gap-1">
          <button onClick={onPlay} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-white text-xs font-semibold">
            <Play size={12} fill="white" /> Cantar
          </button>
          <button onClick={onEnqueue} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-xs">
            <ListPlus size={12} /> Fila
          </button>
          {onFavorite && (
            <button
              onClick={onFavorite}
              className={`px-2 py-1 rounded-lg text-xs ${isFavorite ? 'text-yellow-400 bg-yellow-500/10' : 'bg-muted text-muted-foreground'}`}
              aria-label={isFavorite ? 'Remover das favoritas' : 'Salvar nas favoritas'}
            >
              <Star size={12} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          )}
          {onSeparate && (
            <button
              onClick={onSeparate}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-xs text-muted-foreground"
              title="Separar a voz no PC de casa (para músicas sem versão karaokê)"
            >
              <Cpu size={12} /> PC
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function QueuePanel({
  upcoming,
  onPlay,
  onRemove,
  onUp,
  onDown,
  onClear,
}: {
  upcoming: KaraokeQueueItem[];
  onPlay: (id: string) => void;
  onRemove: (id: string) => void;
  onUp: (id: string) => void;
  onDown: (id: string) => void;
  onClear: () => void;
}) {
  if (upcoming.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        A fila está vazia. Na busca, toque em <strong>Fila</strong> para ir adicionando as músicas da galera.
      </p>
    );
  }
  return (
    <div>
      <ol className="space-y-2">
        {upcoming.map((item, i) => (
          <li key={item.queueId} className="flex items-center gap-2 rounded-xl p-2 bg-muted/30">
            <span className="w-6 text-center text-xs text-muted-foreground font-mono-nums">{i + 1}</span>
            <button onClick={() => onPlay(item.queueId)} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{item.track.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {item.singer ? `${item.singer} · ` : ''}
                {item.track.artist || item.track.channelTitle}
              </p>
            </button>
            <div className="flex items-center">
              <IconBtn onClick={() => onUp(item.queueId)} label="Subir" disabled={i === 0}>
                <ChevronUp size={16} />
              </IconBtn>
              <IconBtn onClick={() => onDown(item.queueId)} label="Descer" disabled={i === upcoming.length - 1}>
                <ChevronDown size={16} />
              </IconBtn>
              <IconBtn onClick={() => onRemove(item.queueId)} label="Remover">
                <Trash2 size={15} />
              </IconBtn>
            </div>
          </li>
        ))}
      </ol>
      <button onClick={onClear} className="mt-3 text-xs text-muted-foreground underline">
        Limpar fila
      </button>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}
