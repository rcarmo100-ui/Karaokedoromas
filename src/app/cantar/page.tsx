import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import AppLayout from '@/components/AppLayout';
import CantarClient from '@/app/cantar/components/CantarClient';

export const metadata: Metadata = {
  title: 'Cantar — Karaokê do Romas',
};

export default function CantarPage() {
  return (
    <AppLayout>
      <Suspense fallback={null}>
        <CantarClient />
      </Suspense>
    </AppLayout>
  );
}
