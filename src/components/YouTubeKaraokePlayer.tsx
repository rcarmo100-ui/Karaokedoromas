'use client';

/**
 * Player do YouTube embutido (IFrame Player API).
 * Avisa quando a música termina (para tocar a próxima da fila),
 * quando o vídeo não pode ser tocado fora do YouTube, e informa o tempo
 * atual para sincronizar a letra.
 */

import React, { useEffect, useRef } from 'react';

// Tipos mínimos da IFrame API (evita dependência extra)
interface YTPlayer {
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  playVideo(): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;

let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Não foi possível carregar o player do YouTube. Verifique a internet.'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/** Mensagem amigável para os códigos de erro da IFrame API. */
export function youtubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return 'Link de vídeo inválido.';
    case 5:
      return 'Este vídeo não pode ser tocado neste navegador.';
    case 100:
      return 'Vídeo não encontrado (removido ou privado).';
    case 101:
    case 150:
    case 153:
      return 'O dono deste vídeo não permite tocar fora do YouTube. Escolha outra versão.';
    default:
      return `O YouTube não conseguiu tocar este vídeo (código ${code}).`;
  }
}

interface Props {
  videoId: string | null;
  /** Muda a cada nova reprodução (ex.: id do item da fila), permitindo repetir o mesmo vídeo */
  playKey?: string | null;
  autoplay?: boolean;
  onEnded?: () => void;
  onError?: (code: number, message: string) => void;
  onTime?: (seconds: number) => void;
  onLoadError?: (message: string) => void;
  className?: string;
}

export default function YouTubeKaraokePlayer({
  videoId,
  playKey,
  autoplay = true,
  onEnded,
  onError,
  onTime,
  onLoadError,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const loadKey = videoId ? `${playKey ?? ''}|${videoId}` : null;
  const pendingVideoRef = useRef<{ id: string; key: string } | null>(
    videoId && loadKey ? { id: videoId, key: loadKey } : null
  );
  const lastLoadedRef = useRef<string | null>(null);

  // Mantém callbacks atuais sem recriar o player
  const cbRef = useRef({ onEnded, onError, onTime, onLoadError, autoplay });
  cbRef.current = { onEnded, onError, onTime, onLoadError, autoplay };

  // Cria o player uma única vez
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const mount = document.createElement('div');
        hostRef.current.appendChild(mount);
        playerRef.current = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            fs: 1,
          },
          events: {
            onReady: () => {
              readyRef.current = true;
              const pending = pendingVideoRef.current;
              if (pending) loadVideo(pending.id, pending.key);
            },
            onStateChange: (e) => {
              if (e.data === YT_STATE_ENDED) cbRef.current.onEnded?.();
            },
            onError: (e) => cbRef.current.onError?.(e.data, youtubeErrorMessage(e.data)),
          },
        });

        timer = setInterval(() => {
          const p = playerRef.current;
          if (!p || !readyRef.current) return;
          try {
            if (p.getPlayerState() === YT_STATE_PLAYING) cbRef.current.onTime?.(p.getCurrentTime());
          } catch {
            // player ainda montando
          }
        }, 200);
      })
      .catch((err: Error) => cbRef.current.onLoadError?.(err.message));

    function loadVideo(id: string, key: string) {
      const p = playerRef.current;
      if (!p) return;
      lastLoadedRef.current = key;
      if (cbRef.current.autoplay) p.loadVideoById(id);
      else p.cueVideoById(id);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      try {
        playerRef.current?.destroy();
      } catch {
        // ignora
      }
      playerRef.current = null;
      readyRef.current = false;
      lastLoadedRef.current = null;
    };
  }, []);

  // Troca de vídeo
  useEffect(() => {
    pendingVideoRef.current = videoId && loadKey ? { id: videoId, key: loadKey } : null;
    const p = playerRef.current;
    if (!videoId || !loadKey || !p || !readyRef.current) return;
    if (lastLoadedRef.current === loadKey) return;
    lastLoadedRef.current = loadKey;
    if (autoplay) p.loadVideoById(videoId);
    else p.cueVideoById(videoId);
  }, [videoId, loadKey, autoplay]);

  return (
    <div className={className}>
      <div ref={hostRef} className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full" />
    </div>
  );
}
