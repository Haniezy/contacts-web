'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import { ThemeButtons } from '@/components/preferences/theme-switch';
import { UserAvatar, type AccountUser } from './account-menu';

// Desktop: search across the top, then the theme and the account (whose
// status line says whether the app is online), which leads to the profile;
// everything else of the account is in the sidebar.
export function DeskTopbar({
  query,
  onQuery,
  user,
  online,
}: {
  query: string;
  onQuery: (query: string) => void;
  user: AccountUser;
  online: boolean;
}) {
  const t = useTranslations('Contacts');
  return (
    <header className="desk-topbar">
      <form
        role="search"
        className="desk-search"
        onSubmit={(event) => event.preventDefault()}
      >
        <Icon name="search" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t('searchContacts')}
          aria-label={t('search')}
          maxLength={200}
          enterKeyHint="search"
        />
      </form>
      <div className="desk-controls">
        <ThemeButtons />
        <span className="desk-divider" aria-hidden="true" />
        <Link
          href="/profile"
          prefetch={false}
          className="desk-user"
          aria-label={t('profile')}
        >
          <span className="desk-user-text">
            <span className="desk-user-name">
              <bdi>{user.firstName}</bdi>
            </span>
            <span className="desk-user-status">
              {t(online ? 'online' : 'offline')}
            </span>
          </span>
          <span className="desk-user-photo">
            <UserAvatar user={user} />
            <span
              className={`desk-presence${online ? ' is-online' : ''}`}
              aria-hidden="true"
            />
          </span>
        </Link>
      </div>
    </header>
  );
}
