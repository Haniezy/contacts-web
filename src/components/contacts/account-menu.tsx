'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { forgetOfflineData } from '@/lib/offline';
import { Icon } from '@/components/icon';
import { ThemeSwitch } from '@/components/preferences/theme-switch';
import { LanguageSwitch } from '@/components/preferences/language-switch';
import { PreferenceIcon } from '@/components/preferences/icons';

export type AccountUser = {
  name: string;
  email: string;
  firstName: string;
  photoUrl: string | null;
};

// The user's photo, or the first letter of their name.
export function UserAvatar({
  user,
  className = '',
}: {
  user: Pick<AccountUser, 'photoUrl'>;
  className?: string;
}) {
  return (
    <span className={`user-avatar ${className}`} aria-hidden="true">
      {user.photoUrl ? (
        // Signed photo links expire after minutes; the image optimizer would cache them.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoUrl} alt="" decoding="async" />
      ) : (
        // No photo: a person icon (a lone first letter read badly, e.g. «ه»).
        <Icon name="user" />
      )}
    </span>
  );
}

// A switch as a sidebar row: the language (and, in the phone drawer, the
// theme, which desktop has in its top bar).
export function PreferenceRow({ kind }: { kind: 'theme' | 'language' }) {
  const p = useTranslations('Preferences');
  return (
    <div className="side-pref">
      <PreferenceIcon name={kind === 'theme' ? 'sun' : 'globe'} />
      <span className="desk-label">{p(kind)}</span>
      {kind === 'theme' ? <ThemeSwitch /> : <LanguageSwitch />}
    </div>
  );
}

// Signing out, last in the sidebar and set apart from the rest.
export function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations('Contacts');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    setBusy(true);
    setFailed(false);
    try {
      await api('auth/logout', {});
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setFailed(true);
        setBusy(false);
        return;
      }
    }
    // Nothing of this account stays on the device for offline use.
    await forgetOfflineData();
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="desk-nav-item side-logout"
        disabled={busy}
        title={collapsed ? t('logout') : undefined}
        onClick={logout}
      >
        <Icon name="logout" />
        <span className="desk-label">{t('logout')}</span>
      </button>
      {failed && (
        <p role="alert" className="form-error">
          {t('failed')}
        </p>
      )}
    </>
  );
}
