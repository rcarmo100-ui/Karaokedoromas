import React from 'react';
import AppLayout from '@/components/AppLayout';
import SyncManagerPanel from '@/components/SyncManagerPanel';
import CloudStorageManager from './components/CloudStorageManager';
import CloudImportPanel from './components/CloudImportPanel';

export default function SyncStoragePage() {
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sincronização e Armazenamento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie o backup na nuvem e o armazenamento local das suas músicas.
          </p>
        </div>

        {/* Sync manager (Local → Cloud) */}
        <SyncManagerPanel />

        {/* Cloud import (Cloud → Local) */}
        <CloudImportPanel />

        {/* Cloud storage manager */}
        <CloudStorageManager />
      </div>
    </AppLayout>
  );
}
