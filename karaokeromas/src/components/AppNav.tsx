'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { Music, Plus, Library, X, Menu, CloudCog, FlaskConical } from 'lucide-react';
import ConnectivityBadge from '@/components/ConnectivityBadge';
import Icon from '@/components/ui/AppIcon';


const navLinks = [
  { href: '/', label: 'Início', icon: Music, key: 'nav-home' },
  { href: '/add-music-screen', label: 'Adicionar', icon: Plus, key: 'nav-add' },
  { href: '/karaoke-player-screen', label: 'Player', icon: Library, key: 'nav-player' },
  { href: '/sync-storage', label: 'Sync', icon: CloudCog, key: 'nav-sync' },
  { href: '/audio-ai-poc', label: 'POC Vocal', icon: FlaskConical, key: 'nav-poc' },
];

export default function AppNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 player-bar-blur" suppressHydrationWarning>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-16">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <AppLogo size={36} />
              <span className="font-sans font-800 text-lg tracking-tight text-gradient-primary hidden sm:block">
                Karaokê do Romas
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks?.map((link) => {
                const Icon = link?.icon;
                const isActive = pathname === link?.href;
                return (
                  <Link
                    key={link?.key}
                    href={link?.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-primary/20 text-primary' :'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <Icon size={16} />
                    {link?.label}
                  </Link>
                );
              })}
              <ConnectivityBadge className="ml-2" />
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 active:scale-95"
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-card border-l border-border flex flex-col slide-up">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <AppLogo size={32} />
                <span className="font-semibold text-sm text-gradient-primary">Karaokê do Romas</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150"
                aria-label="Fechar menu"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col gap-1 p-4">
              {navLinks?.map((link) => {
                const Icon = link?.icon;
                const isActive = pathname === link?.href;
                return (
                  <Link
                    key={`mobile-${link?.key}`}
                    href={link?.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-primary/20 text-primary' :'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <Icon size={18} />
                    {link?.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}