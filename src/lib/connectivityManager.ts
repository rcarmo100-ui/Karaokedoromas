/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONNECTIVITY MANAGER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Monitors network connectivity and exposes ONLINE/OFFLINE state.
 *
 * IMPORTANT:
 *   - ONLINE does NOT mean sync is active
 *   - Sync is DISABLED by default
 *   - User must explicitly enable sync
 *
 * States:
 *   connectivity: 'ONLINE' | 'OFFLINE'
 *   syncEnabled:  boolean (default: false)
 *
 * CHECKPOINT_1_CORE_LOCAL
 * ════════════════════════════════════════════════════════════════════════════
 */

import { settingsGet, settingsSet } from './localDB';

export type ConnectivityState = 'ONLINE' | 'OFFLINE';

export interface ConnectivityStatus {
  connectivity: ConnectivityState;
  syncEnabled: boolean;
}

type ConnectivityListener = (status: ConnectivityStatus) => void;

// ── Internal state ────────────────────────────────────────────────────────────

let currentConnectivity: ConnectivityState = 'OFFLINE';
let syncEnabled = false;
let initialized = false;
const listeners: Set<ConnectivityListener> = new Set();

// ── Notify all listeners ──────────────────────────────────────────────────────

function notifyListeners() {
  const status: ConnectivityStatus = {
    connectivity: currentConnectivity,
    syncEnabled,
  };
  listeners.forEach((fn) => {
    try { fn(status); } catch { /* ignore listener errors */ }
  });
}

// ── Initialize ────────────────────────────────────────────────────────────────

export async function initConnectivityManager(): Promise<void> {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  // Load saved sync preference
  syncEnabled = await settingsGet<boolean>('syncEnabled', false);

  // Set initial state from browser
  currentConnectivity = navigator.onLine ? 'ONLINE' : 'OFFLINE';

  // Listen for browser online/offline events
  window.addEventListener('online', () => {
    currentConnectivity = 'ONLINE';
    notifyListeners();
  });

  window.addEventListener('offline', () => {
    currentConnectivity = 'OFFLINE';
    notifyListeners();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getConnectivityStatus(): ConnectivityStatus {
  return {
    connectivity: currentConnectivity,
    syncEnabled,
  };
}

export function isOnline(): boolean {
  return currentConnectivity === 'ONLINE';
}

export function isSyncEnabled(): boolean {
  return syncEnabled;
}

/**
 * Enable or disable cloud synchronization.
 * This setting is persisted to IndexedDB.
 */
export async function setSyncEnabled(enabled: boolean): Promise<void> {
  syncEnabled = enabled;
  await settingsSet('syncEnabled', enabled);
  notifyListeners();
}

/**
 * Subscribe to connectivity changes.
 * Returns an unsubscribe function.
 */
export function onConnectivityChange(listener: ConnectivityListener): () => void {
  listeners.add(listener);
  // Immediately call with current state
  try {
    listener({ connectivity: currentConnectivity, syncEnabled });
  } catch { /* ignore */ }
  return () => listeners.delete(listener);
}
