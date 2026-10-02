import React from 'react';
import AppLayout from '@/components/AppLayout';
import HeroSection from '@/app/components/HeroSection';
import RecentSongsRow from '@/app/components/RecentSongsRow';
import SongLibraryGrid from '@/app/components/SongLibraryGrid';

export default function HomePage() {
  return (
    <AppLayout>
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-16 pb-20">
        <HeroSection />
        <RecentSongsRow />
        <SongLibraryGrid />
      </div>
    </AppLayout>
  );
}