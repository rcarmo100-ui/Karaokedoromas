/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONNECTIVITY HOOK — React hook for connectivity state
 * ════════════════════════════════════════════════════════════════════════════
 */
'use client';

import { useState, useEffect } from 'react';
import {
  initConnectivityManager,
  onConnectivityChange,
  getConnectivityStatus,
  setSyncEnabled,
  type ConnectivityStatus,
} from '@/lib/connectivityManager';

export function useConnectivity() {
  const [status, setStatus] = useState<ConnectivityStatus>({
    connectivity: 'OFFLINE',
    syncEnabled: false,
  });

  useEffect(() => {
    // Initialize manager (safe to call multiple times)
    initConnectivityManager().then(() => {
      setStatus(getConnectivityStatus());
    });

    const unsub = onConnectivityChange((s) => setStatus(s));
    return unsub;
  }, []);

  return {
    ...status,
    isOnline: status.connectivity === 'ONLINE',
    isOffline: status.connectivity === 'OFFLINE',
    toggleSync: (enabled: boolean) => setSyncEnabled(enabled),
  };
}
