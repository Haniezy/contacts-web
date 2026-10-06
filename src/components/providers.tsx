'use client';

import { ThemeProvider } from 'next-themes';
import { Pwa } from './pwa';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem={false}
      storageKey="contacts-theme"
    >
      {children}
      <Pwa />
    </ThemeProvider>
  );
}
