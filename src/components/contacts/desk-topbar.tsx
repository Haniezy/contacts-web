'use client';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import { ThemeButtons } from '@/components/preferences/theme-switch';
import { UserAvatar, type AccountUser } from './account-menu';

// Desktop: search across the top, then the theme and the account (whose
// status line says whether the app is online), which opens the menu.
export function DeskTopbar({
  query,
  onQuery,
  user,
  online,
  menuOpen,
  onMenu,
}: {
  query: string;
  onQuery: (query: string) => void;
  user: AccountUser;
  online: boolean;
  menuOpen: boolean;
  onMenu: () => void;
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
        <button
          type="button"
          className="desk-user"
          aria-label={t('account')}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={onMenu}
        >
          <Icon name="chevron" />
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
        </button>
      </div>
    </header>
  );
}
