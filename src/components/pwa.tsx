'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { listenForInstall } from '@/lib/install';
import { Icon } from '@/components/icon';

const onlineStore = {
  subscribe(listener: () => void) {
    addEventListener('online', listener);
    addEventListener('offline', listener);
    return () => {
      removeEventListener('online', listener);
      removeEventListener('offline', listener);
    };
  },
  get: () => navigator.onLine,
  server: () => true,
};

// The installable-app pieces every page shares: the service worker (in
// production builds only, so development never serves stale files), the
// install offer, and a note while there is no connection.
export function Pwa() {
  const t = useTranslations('Install');
  const online = useSyncExternalStore(
    onlineStore.subscribe,
    onlineStore.get,
    onlineStore.server,
  );
  useEffect(() => {
    listenForInstall();
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Without it the site still works, just not offline.
      });
  }, []);
  if (online) return null;
  return (
    <p className="offline-note" role="status">
      <Icon name="alert" />
      {t('offline')}
    </p>
  );
}
