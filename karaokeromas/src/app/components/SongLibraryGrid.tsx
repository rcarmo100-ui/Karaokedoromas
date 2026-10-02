'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Play, Music2, Plus, SlidersHorizontal, Loader2, AlertCircle, HardDrive } from 'lucide-react';
import { genreColorMap, genreOptions } from '@/lib/songStore';
import { getRecentSongs } from '@/lib/firestoreService';
import type { SongDocument } from '@/lib/firestoreService';
import { repositoryGetAllSongs, type LocalSong } from '@/lib/songRepository';
import { isOnline } from '@/lib/connectivityManager';
import { initConnectivityManager } from '@/lib/connectivityManager';

// Unified song type for display
interface DisplaySong {
  id: string;
  title: string;
  artist: string;
  genre: string;
  status: string;
  coverColor?: string;
  duration?: string;
  isLocal: boolean;
  localId?: string;
  cloudId?: string;
}

function localSongToDisplay(s: LocalSong): DisplaySong {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    genre: s.genre,
    status: s.processingStatus === 'DONE' ? 'ready' : s.processingStatus.toLowerCase(),
    coverColor: s.coverColor,
    duration: s.duration,
    isLocal: true,
    localId: s.id,
    cloudId: s.cloudSongId,
  };
}

function cloudSongToDisplay(s: SongDocument): DisplaySong {
  return {
    id: s.id ?? '',
    title: s.title,
    artist: s.artist,
    genre: s.genre,
    status: s.status,
    coverColor: s.coverColor,
    duration: s.duration,
    isLocal: false,
    cloudId: s.id,
  };
}

export default function SongLibraryGrid() {
  const [songs, setSongs] = useState<DisplaySong[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [source, setSource] = useState<'local' | 'cloud'>('local');

  useEffect(() => {
    async function loadSongs() {
      try {
        setLoading(true);
        setLoadError(null);

        // Initialize connectivity manager
        await initConnectivityManager();

        // Always try local first
        const localSongs = await repositoryGetAllSongs();

        if (localSongs.length > 0) {
          setSongs(localSongs.map(localSongToDisplay));
          setSource('local');
          setLoading(false);
          return;
        }

        // If no local songs and online, try Firebase
        if (isOnline()) {
          try {
            const cloudData = await getRecentSongs(100);
            setSongs(cloudData.map(cloudSongToDisplay));
            setSource('cloud');
          } catch (cloudErr) {
            console.warn('[SongLibraryGrid] Firebase fallback failed:', cloudErr);
            setSongs([]);
          }
        } else {
          setSongs([]);
        }
      } catch (err) {
        console.error('[SongLibraryGrid] Failed to load songs:', err);
        setLoadError('Não foi possível carregar a biblioteca.');
      } finally {
        setLoading(false);
      }
    }
    loadSongs();
  }, []);

  const filteredSongs = songs.filter((song) => {
    const matchesSearch =
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      song.artist.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre =
      selectedGenre === 'all' || song.genre.toLowerCase().replace(/ /g, '-') === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  const uniqueGenres = ['all', ...Array.from(new Set(songs.map((s) => s.genre.toLowerCase().replace(/ /g, '-'))))];

  function getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      queued: 'Aguardando',
      processing: 'Processando',
      ready: 'Pronta',
      done: 'Pronta',
      error: 'Erro',
      demo: 'Demo',
      pending: 'Pendente',
    };
    return map[status.toLowerCase()] ?? status;
  }

  function getStatusColor(status: string): string {
    const s = status.toLowerCase();
    if (s === 'ready' || s === 'done') return 'bg-green-500/70';
    if (s === 'error') return 'bg-red-500/70';
    if (s === 'processing') return 'bg-blue-500/70';
    return 'bg-black/60';
  }

  function getPlayerHref(song: DisplaySong): string {
    // Prefer local ID for local songs, cloud ID for cloud-only songs
    if (song.isLocal) return `/karaoke-player-screen?localId=${song.id}`;
    if (song.cloudId) return `/karaoke-player-screen?songId=${song.cloudId}`;
    return '/karaoke-player-screen';
  }

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-gradient-primary rounded-full" />
          <h2 className="text-lg font-semibold text-foreground">Biblioteca Completa</h2>
          {!loading && (
            <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
              {filteredSongs.length} músicas
            </span>
          )}
          {!loading && source === 'local' && (
            <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
              <HardDrive size={10} />
              Local
            </span>
          )}
        </div>
        <Link
          href="/add-music-screen"
          className="flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white font-semibold text-sm rounded-xl transition-all duration-150 hover:scale-105 active:scale-95"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Adicionar</span>
        </Link>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Carregando biblioteca...</span>
        </div>
      )}

      {/* Error state */}
      {!loading && loadError && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-6">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{loadError}</p>
        </div>
      )}

      {/* Search + Filter bar */}
      {!loading && !loadError && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por título ou artista..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-input border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all duration-150"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <SlidersHorizontal size={14} className="text-muted-foreground flex-shrink-0" />
              {uniqueGenres.map((genre) => {
                const isAll = genre === 'all';
                const genreColor = isAll ? '#a855f7' : (genreColorMap[genre] || '#52525b');
                const isSelected = selectedGenre === genre;
                const label = isAll ? 'Todos' : (genreOptions.find((g) => g.value === genre)?.label || genre);
                return (
                  <button
                    key={`filter-${genre}`}
                    onClick={() => setSelectedGenre(genre)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 active:scale-95 ${
                      isSelected ? 'text-white' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    style={
                      isSelected
                        ? { background: genreColor }
                        : { background: `${genreColor}22`, border: `1px solid ${genreColor}44` }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid */}
          {filteredSongs.length === 0 ? (
            <EmptyLibraryState query={searchQuery} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {filteredSongs.map((song) => {
                const genreColor = genreColorMap[song.genre.toLowerCase().replace(/ /g, '-')] || '#52525b';
                return (
                  <Link
                    key={song.id}
                    href={getPlayerHref(song)}
                    className="bg-card-elevated rounded-2xl overflow-hidden song-card-hover group cursor-pointer block"
                  >
                    {/* Cover art */}
                    <div
                      className="h-36 flex items-center justify-center relative"
                      style={{ background: `linear-gradient(135deg, ${genreColor}22 0%, ${genreColor}55 100%)` }}
                    >
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-3xl font-extrabold"
                        style={{ background: `${genreColor}33`, color: genreColor, border: `2px solid ${genreColor}66` }}
                      >
                        {song.title.charAt(0)}
                      </div>

                      {/* Hover play overlay */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                          <Play size={20} className="text-white ml-1" fill="white" />
                        </div>
                      </div>

                      {/* Status badge */}
                      <div className={`absolute bottom-2 right-2 backdrop-blur-sm px-2 py-0.5 rounded-md ${getStatusColor(song.status)}`}>
                        <span className="text-xs text-white/90 font-medium">
                          {getStatusLabel(song.status)}
                        </span>
                      </div>

                      {/* Local indicator */}
                      {song.isLocal && (
                        <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
                          <HardDrive size={9} className="text-green-400" />
                        </div>
                      )}
                    </div>

                    {/* Song info */}
                    <div className="p-3">
                      <p className="text-sm font-semibold text-foreground truncate">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{song.artist}</p>
                      <div className="mt-2">
                        <span
                          className="genre-badge"
                          style={{ color: genreColor, background: `${genreColor}22` }}
                        >
                          {song.genre}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}

              {/* Add new card */}
              <Link
                href="/add-music-screen"
                className="bg-card-elevated border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center h-full min-h-[200px] gap-3 transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 group"
              >
                <div className="w-12 h-12 rounded-full bg-muted/60 group-hover:bg-primary/20 flex items-center justify-center transition-colors duration-200">
                  <Plus size={22} className="text-muted-foreground group-hover:text-primary transition-colors duration-200" />
                </div>
                <span className="text-sm text-muted-foreground group-hover:text-primary font-medium transition-colors duration-200 text-center px-2">
                  Adicionar Música
                </span>
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EmptyLibraryState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 rounded-full bg-muted/40 flex items-center justify-center mb-5">
        <Music2 size={32} className="text-muted-foreground" />
      </div>
      {query ? (
        <>
          <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma música encontrada</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Nenhuma música corresponde a <span className="text-primary">&quot;{query}&quot;</span>. Tente outro termo ou adicione essa música.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-semibold text-foreground mb-2">Biblioteca vazia</h3>
          <p className="text-sm text-muted-foreground max-w-xs mb-6">
            Sua biblioteca de karaokê ainda não tem músicas. Adicione sua primeira música para começar.
          </p>
          <Link
            href="/add-music-screen"
            className="flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-xl transition-all duration-150 hover:scale-105 active:scale-95"
          >
            <Plus size={16} />
            Adicionar primeira música
          </Link>
        </>
      )}
    </div>
  );
}