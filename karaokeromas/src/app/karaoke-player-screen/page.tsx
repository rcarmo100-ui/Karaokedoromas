import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import KaraokePlayerClient from '@/app/karaoke-player-screen/components/KaraokePlayerClient';

export default function KaraokePlayerPage() {
  return (
    <AppLayout hideNav={false}>
      <Suspense fallback={null}>
        <KaraokePlayerClient />
      </Suspense>
    </AppLayout>
  );
}