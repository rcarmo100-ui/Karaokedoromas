'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock, Play, ChevronRight, Loader2, HardDrive } from 'lucide-react';
import { genreColorMap } from '@/lib/songStore';
import { repositoryGetRecentSongs, type LocalSong } from '@/lib/songRepository';

export default function RecentSongsRow() {
  const [recentSongs, setRecentSongs] = useState<LocalSong[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRecent() {
      try {
        const data = await repositoryGetRecentSongs(5);
        setRecentSongs(data);
      } catch (err) {
        console.error('[RecentSongsRow] Failed to load recent songs:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRecent();
  }, []);

  if (loading) {
    return (
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-1 h-6 bg-gradient-primary rounded-full" />
          <h2 className="text-lg font-semibold text-foreground">Adicionadas Recentemente</h2>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      </section>
    );
  }

  if (recentSongs.length === 0) return null;

  return (
    <section className="mb-12">
      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-gradient-primary rounded-full" />
          <h2 className="text-lg font-semibold text-foreground">Adicionadas Recentemente</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock size={12} />
            <span>Últimas 5</span>
          </div>
        </div>
        <Link
          href="/add-music-screen"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors duration-150"
        >
          Ver todas
          <ChevronRight size={14} />
        </Link>
      </div>

      {/* Horizontal scroll row */}
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {recentSongs.map((song) => {
          const genreColor = genreColorMap?.[song?.genre?.toLowerCase()?.replace(/ /g, '-')] || '#52525b';
          const playerHref = `/karaoke-player-screen?localId=${song.id}`;
          const statusLabel =
            song.processingStatus === 'DONE' ? null :
            song.processingStatus === 'QUEUED' ? 'Aguardando' :
            song.processingStatus === 'PROCESSING' ? 'Processando' :
            song.processingStatus === 'ERROR' ? 'Erro' : null;

          return (
            <Link
              key={song?.id}
              href={playerHref}
              className="flex-shrink-0 w-48 sm:w-56 bg-card-elevated rounded-2xl overflow-hidden song-card-hover group cursor-pointer"
            >
              {/* Cover */}
              <div
                className="h-28 sm:h-32 flex items-center justify-center relative"
                style={{ background: `linear-gradient(135deg, ${genreColor}33 0%, ${genreColor}66 100%)` }}
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: `${genreColor}44`, border: `2px solid ${genreColor}88` }}
                >
                  <span className="text-2xl font-bold" style={{ color: genreColor }}>
                    {song?.title?.charAt(0)}
                  </span>
                </div>
                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Play size={18} className="text-white ml-0.5" fill="white" />
                  </div>
                </div>
                {/* Local indicator */}
                <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
                  <HardDrive size={9} className="text-green-400" />
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="text-sm font-semibold text-foreground truncate">{song?.title}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{song?.artist}</p>
                <div className="flex items-center justify-between mt-2">
                  <span
                    className="genre-badge"
                    style={{ color: genreColor, background: `${genreColor}22` }}
                  >
                    {song?.genre}
                  </span>
                  {statusLabel && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
                      song.processingStatus === 'ERROR' ? 'text-red-400 bg-red-400/10'
                        : song.processingStatus === 'PROCESSING'? 'text-blue-400 bg-blue-400/10' :'text-amber-400 bg-amber-400/10'
                    }`}>
                      {statusLabel}
                    </span>
                  )}
                  {song?.duration && song.processingStatus === 'DONE' && (
                    <span className="text-xs text-muted-foreground font-mono-nums">{song?.duration}</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}