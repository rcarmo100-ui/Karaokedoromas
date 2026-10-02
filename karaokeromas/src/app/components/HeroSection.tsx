import React from 'react';
import Link from 'next/link';
import { Plus, Mic2, Sparkles } from 'lucide-react';

export default function HeroSection() {
  return (
    <section className="relative py-16 md:py-24 lg:py-28 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/3 left-1/3 w-[300px] h-[300px] rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #ec4899 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8">
          <Sparkles size={14} className="text-primary" />
          <span className="text-xs font-semibold text-primary tracking-wider uppercase">
            Sua noite de karaokê perfeita
          </span>
        </div>

        {/* Title */}
        <h1 className="hero-title font-extrabold tracking-tight mb-4">
          <span className="text-gradient-primary">Karaokê</span>
          <br />
          <span className="text-foreground">do Romas</span>
        </h1>

        {/* Subtitle */}
        <p className="text-muted-foreground text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
          Adicione suas músicas favoritas, veja a letra na tela e cante junto com o player completo.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/add-music-screen"
            className="flex items-center gap-3 px-8 py-4 bg-gradient-primary text-white font-bold text-base rounded-2xl glow-primary transition-all duration-200 hover:scale-105 active:scale-95 w-full sm:w-auto justify-center"
          >
            <Plus size={20} />
            Adicionar Música
          </Link>
          <Link
            href="/karaoke-player-screen"
            className="flex items-center gap-3 px-8 py-4 bg-muted/60 border border-border text-foreground font-semibold text-base rounded-2xl transition-all duration-200 hover:bg-muted hover:scale-105 active:scale-95 w-full sm:w-auto justify-center"
          >
            <Mic2 size={20} />
            Abrir Player
          </Link>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-center gap-8 mt-12">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">8</p>
            <p className="text-xs text-muted-foreground mt-1">Músicas</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">5</p>
            <p className="text-xs text-muted-foreground mt-1">Artistas</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">4</p>
            <p className="text-xs text-muted-foreground mt-1">Gêneros</p>
          </div>
        </div>
      </div>
    </section>
  );
}