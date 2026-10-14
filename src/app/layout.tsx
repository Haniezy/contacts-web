import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Providers } from '@/components/providers';
import { direction } from '@/i18n/config';
import {
  defaultPalette,
  isPalette,
  paletteCookie,
  paletteScript,
} from '@/lib/palette';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Home');
  return {
    title: t('title'),
    // Added to an iPhone's home screen, it opens like an app.
    appleWebApp: { capable: true, title: 'دفترچه', statusBarStyle: 'default' },
    icons: {
      icon: '/icons/icon-192.png',
      apple: '/icons/apple-touch-icon.png',
    },
  };
}

// The browser and app bars take the page background of each mode, in the
// chosen colour theme (see globals.css).
const barColors = {
  terracotta: ['#fbe9dd', '#191614'],
  slate: ['#f6f8fa', '#0f1419'],
  forest: ['#f5ede1', '#171e19'],
};
async function chosenPalette() {
  const value = (await cookies()).get(paletteCookie)?.value;
  return isPalette(value) ? value : defaultPalette;
}
export async function generateViewport(): Promise<Viewport> {
  const [light, dark] = barColors[await chosenPalette()];
  return {
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: light },
      { media: '(prefers-color-scheme: dark)', color: dark },
    ],
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  // The colour theme chosen in Settings; light or dark comes from the
  // theme switch (data-theme).
  const palette = await chosenPalette();
  return (
    <html
      lang={locale}
      dir={direction(locale)}
      data-palette={palette}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: paletteScript }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
