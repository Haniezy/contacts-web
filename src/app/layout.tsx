import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Providers } from '@/components/providers';
import { direction } from '@/i18n/config';
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

// The browser and app bars take the page background of each theme.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#161c27' },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={direction(locale)} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
