'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
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

// Mobile: side drawer. Desktop: dropdown under the account button.
export function AccountMenu({
  open,
  onClose,
  user,
  duplicates,
}: {
  open: boolean;
  onClose: () => void;
  user: AccountUser;
  duplicates: number;
}) {
  const t = useTranslations('Contacts');
  const p = useTranslations('Preferences');
  const f = useFormatter();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

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
    router.replace('/login');
    router.refresh();
  }

  return (
    <dialog
      ref={dialog}
      className="account-menu"
      aria-label={t('menu')}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="menu-sheet">
        <div className="menu-user">
          <UserAvatar user={user} />
          <div>
            <p className="menu-hello">{t('hello')}</p>
            <p className="menu-name">
              <bdi>{user.name}</bdi>
            </p>
            <p className="menu-email">
              <bdi>{user.email}</bdi>
            </p>
          </div>
        </div>
        <ul className="menu-items">
          <li>
            <span className="menu-icon icon-theme">
              <PreferenceIcon name="sun" />
            </span>
            <span className="menu-text">{p('theme')}</span>
            <ThemeSwitch />
          </li>
          <li>
            <span className="menu-icon icon-language">
              <PreferenceIcon name="globe" />
            </span>
            <span className="menu-text">{p('language')}</span>
            <LanguageSwitch />
          </li>
          <li>
            <Link href="/profile" prefetch={false} className="menu-link">
              <span className="menu-icon icon-profile">
                <Icon name="user" />
              </span>
              <span className="menu-text">{t('profile')}</span>
            </Link>
          </li>
          <li>
            <Link
              href="/contacts/duplicates"
              prefetch={false}
              className="menu-link"
            >
              <span className="menu-icon icon-merge">
                <Icon name="users" />
              </span>
              <span className="menu-text">{t('merge')}</span>
              {duplicates > 0 && (
                <span className="menu-badge">{f.number(duplicates)}</span>
              )}
            </Link>
          </li>
          <li>
            <Link href="/settings" prefetch={false} className="menu-link">
              <span className="menu-icon icon-settings">
                <Icon name="settings" />
              </span>
              <span className="menu-text">{t('settings')}</span>
            </Link>
          </li>
        </ul>
        <div className="menu-footer">
          <button
            type="button"
            className="menu-link menu-logout"
            disabled={busy}
            onClick={logout}
          >
            <span className="menu-icon icon-logout">
              <Icon name="logout" />
            </span>
            <span className="menu-text">{t('logout')}</span>
          </button>
          {failed && (
            <p role="alert" className="form-error">
              {t('failed')}
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}
