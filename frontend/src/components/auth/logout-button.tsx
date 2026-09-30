'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
export function LogoutButton() {
  const t = useTranslations('Contacts');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  return (
    <div>
      <button
        className="text-link"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            await api('auth/logout', {});
            router.replace('/login');
            router.refresh();
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              router.replace('/login');
              router.refresh();
            } else {
              setFailed(true);
              setBusy(false);
            }
          }
        }}
      >
        {t('logout')}
      </button>
      {failed && <p role="alert">{t('failed')}</p>}
    </div>
  );
}
