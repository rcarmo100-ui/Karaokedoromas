'use client';

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Cloud, CloudOff } from 'lucide-react';
import { useConnectivity } from '@/hooks/useConnectivity';

interface ConnectivityBadgeProps {
  showSync?: boolean;
  className?: string;
}

export default function ConnectivityBadge({ showSync = true, className = '' }: ConnectivityBadgeProps) {
  const { isOnline, syncEnabled } = useConnectivity();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render a neutral placeholder during SSR and initial hydration
  // to prevent server/client HTML mismatch
  if (!mounted) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted/40 text-muted-foreground border border-border/40">
          <Wifi size={11} className="flex-shrink-0 opacity-50" />
          <span>...</span>
        </div>
        {showSync && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted/40 text-muted-foreground border border-border/40">
            <Cloud size={11} className="flex-shrink-0 opacity-50" />
            <span>...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Online/Offline indicator */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
          isOnline
            ? 'bg-green-500/15 text-green-400 border border-green-500/25' :'bg-red-500/15 text-red-400 border border-red-500/25'
        }`}
      >
        {isOnline ? (
          <Wifi size={11} className="flex-shrink-0" />
        ) : (
          <WifiOff size={11} className="flex-shrink-0" />
        )}
        <span>{isOnline ? 'Online' : 'Offline'}</span>
      </div>

      {/* Sync indicator */}
      {showSync && (
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
            syncEnabled
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25' :'bg-muted/40 text-muted-foreground border border-border/40'
          }`}
        >
          {syncEnabled ? (
            <Cloud size={11} className="flex-shrink-0" />
          ) : (
            <CloudOff size={11} className="flex-shrink-0" />
          )}
          <span>{syncEnabled ? 'Sync ativo' : 'Sync desativado'}</span>
        </div>
      )}
    </div>
  );
}
