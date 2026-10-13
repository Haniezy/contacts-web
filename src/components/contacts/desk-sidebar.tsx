'use client';
import { useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { Icon, type IconName } from '@/components/icon';

// Whether the sidebar is narrowed to icons, remembered in this browser.
const sidebarKey = 'contacts-sidebar';
const sidebarListeners = new Set<() => void>();
const sidebarStore = {
  subscribe(listener: () => void) {
    sidebarListeners.add(listener);
    return () => sidebarListeners.delete(listener);
  },
  get() {
    try {
      return localStorage.getItem(sidebarKey) === 'collapsed';
    } catch {
      return false;
    }
  },
  server: () => false,
};
export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(
    sidebarStore.subscribe,
    sidebarStore.get,
    sidebarStore.server,
  );
  const toggle = () => {
    try {
      if (collapsed) localStorage.removeItem(sidebarKey);
      else localStorage.setItem(sidebarKey, 'collapsed');
    } catch {
      // Without storage it is not remembered.
    }
    sidebarListeners.forEach((listener) => listener());
  };
  return [collapsed, toggle] as const;
}

// Desktop: the book's sections at the side, with how many each holds, the
// add button and a drawn sprig. The menu button narrows it to icons.
export function DeskSidebar({
  total,
  duplicates,
  trash,
  collapsed,
  onToggle,
  addLink,
}: {
  total?: number;
  duplicates?: number;
  trash?: number;
  collapsed: boolean;
  onToggle: () => void;
  // The add button, which opens the form in place.
  addLink: (className: string, children: ReactNode) => ReactNode;
}) {
  const t = useTranslations('Contacts');
  const d = useTranslations('Duplicates');
  const tr = useTranslations('Trash');
  const f = useFormatter();
  const item = (
    href: string,
    icon: IconName,
    label: string,
    count?: number,
    current = false,
  ) => (
    <Link
      href={href}
      prefetch={false}
      className={`desk-nav-item${current ? ' is-current' : ''}`}
      aria-current={current ? 'page' : undefined}
      title={collapsed ? label : undefined}
    >
      <Icon name={icon} />
      <span className="desk-label">{label}</span>
      {count ? <span className="desk-badge">{f.number(count)}</span> : null}
    </Link>
  );
  return (
    <aside
      className={`desk-sidebar${collapsed ? ' is-collapsed' : ''}`}
      aria-label={t('sidebar')}
    >
      <div className="desk-brand">
        <Link href="/contacts" className="desk-logo">
          <Icon name="leaf" />
          <span className="desk-label">{t('brandFull')}</span>
        </Link>
        <button
          type="button"
          className="desk-collapse"
          aria-label={t(collapsed ? 'expandMenu' : 'collapseMenu')}
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <Icon name="menu" />
        </button>
      </div>
      <div className="desk-card">
        <nav className="desk-nav">
          {item('/contacts', 'users', t('title'), total, true)}
          {item('/contacts/duplicates', 'copy', d('title'), duplicates)}
          {item('/contacts/trash', 'trash', tr('menu'), trash)}
        </nav>
        {addLink(
          'button-primary desk-add',
          <>
            <Icon name="plus" />
            <span className="desk-label">{t('addContact')}</span>
          </>,
        )}
      </div>
      <figure className="desk-art" aria-hidden="true">
        <svg
          viewBox="0 0 180 110"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 106C50 90 100 58 174 6" />
          <path d="M34 93c-3-13 3-25 15-31 3 13-3 25-15 31Zm0 0 15-31" />
          <path d="M44 88c13-1 24 7 27 19-13 1-24-7-27-19Zm0 0 27 19" />
          <path d="M70 74c-1-14 7-25 20-28 1 14-7 25-20 28Zm0 0 20-28" />
          <path d="M82 67c12 3 20 13 19 26-12-3-20-13-19-26Zm0 0 19 26" />
          <path d="M104 52c1-13 11-22 24-22-1 13-11 22-24 22Zm0 0 24-22" />
          <path d="M116 44c12 5 18 16 15 28-12-5-18-16-15-28Zm0 0 15 28" />
          <path d="M138 28c3-12 14-19 26-17-3 12-14 19-26 17Zm0 0 26-17" />
          <path d="M148 22c10 6 13 17 9 27-10-6-13-17-9-27Zm0 0 9 27" />
        </svg>
        <figcaption>
          {t('slogan')}
          {'\u00a0'}
          <span className="desk-heart">♡</span>
        </figcaption>
      </figure>
    </aside>
  );
}
