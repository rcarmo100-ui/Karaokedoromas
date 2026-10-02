'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import AddMusicForm from '@/app/add-music-screen/components/AddMusicForm';
import ProcessingScreen from '@/app/add-music-screen/components/ProcessingScreen';

export type AddMusicFormData = {
  title: string;
  artist: string;
  genre: string;
  youtubeUrl?: string;
  notes?: string;
  songId?: string;
};

type ScreenState = 'form' | 'processing' | 'done';

export default function AddMusicPage() {
  const [screenState, setScreenState] = useState<ScreenState>('form');
  const [formData, setFormData] = useState<AddMusicFormData | null>(null);

  function handleFormSubmit(data: AddMusicFormData & { songId: string }) {
    setFormData(data);
    setScreenState('processing');
  }

  function handleProcessingComplete() {
    setScreenState('done');
  }

  return (
    <AppLayout>
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-16 py-8">
        {screenState === 'form' && (
          <AddMusicForm onSubmit={handleFormSubmit} />
        )}
        {(screenState === 'processing' || screenState === 'done') && formData && (
          <ProcessingScreen
            formData={formData}
            onComplete={handleProcessingComplete}
            isDone={screenState === 'done'}
          />
        )}
      </div>
    </AppLayout>
  );
}