import React from 'react';
import AppNav from '@/components/AppNav';

interface AppLayoutProps {
  children: React.ReactNode;
  hideNav?: boolean;
}

export default function AppLayout({ children, hideNav = false }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {!hideNav && <AppNav />}
      <main className={!hideNav ? 'pt-16' : ''}>
        {children}
      </main>
    </div>
  );
}