'use client';
import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { Icon, type IconName } from '@/components/icon';
import type { Tag } from '@/lib/contacts';
import { TagDot } from './tags';
import {
  LogoutButton,
  ThemeRow,
  UserAvatar,
  type AccountUser,
} from './account-menu';
import { LanguageRow } from '@/components/preferences/language-switch';
import { InstallMenuItem } from './install-sheet';

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

type SidebarProps = {
  user: AccountUser;
  total?: number;
  duplicates?: number;
  trash?: number;
  // The add button, which opens the form in place.
  addLink: (className: string, children: ReactNode) => ReactNode;
  tags: Tag[];
  tagFilter: string | null;
  onTag: (id: string | null) => void;
  onNewTag: () => void;
  onEditTag: (tag: Tag) => void;
};

// The book's sections with how many each holds, mixed with the account in
// the owner's order (contacts, profile, language, duplicates, trash,
// settings, sign out); then the tags (each one shows only its contacts)
// with the add button under them; and a drawn sprig. One body: the desktop
// sidebar and the phone's drawer.
function SidebarBody({
  user,
  total,
  duplicates,
  trash,
  addLink,
  tags,
  tagFilter,
  onTag,
  onNewTag,
  onEditTag,
  drawer = false,
  collapsed = false,
  control,
}: SidebarProps & {
  drawer?: boolean;
  collapsed?: boolean;
  // Narrows the desktop sidebar, or closes the drawer.
  control: ReactNode;
}) {
  const t = useTranslations('Contacts');
  const d = useTranslations('Duplicates');
  const tr = useTranslations('Trash');
  const f = useFormatter();
  const tagsTitle = useId();
  const item = (
    href: string,
    icon: IconName,
    label: string,
    count?: number,
    current = false,
    onClick?: () => void,
  ) => (
    <Link
      href={href}
      prefetch={false}
      className={`desk-nav-item${current ? ' is-current' : ''}`}
      aria-current={current ? 'page' : undefined}
      title={collapsed ? label : undefined}
      onClick={
        onClick &&
        ((event) => {
          event.preventDefault();
          onClick();
        })
      }
    >
      <Icon name={icon} />
      <span className="desk-label">{label}</span>
      {count ? <span className="desk-badge">{f.number(count)}</span> : null}
    </Link>
  );
  return (
    <>
      <div className="desk-brand">
        <Link href="/contacts" className="desk-logo">
          <Icon name="leaf" />
          <span className="desk-label">{t('brandFull')}</span>
        </Link>
        {control}
      </div>
      {/* The drawer has no top bar above it: the account comes first. */}
      {drawer && (
        <div className="side-user">
          <UserAvatar user={user} />
          <div>
            <p className="side-hello">{t('hello')}</p>
            <p className="side-name">
              <bdi>{user.name}</bdi>
            </p>
            <p className="side-email">
              <bdi>{user.email}</bdi>
            </p>
          </div>
        </div>
      )}
      <nav className="desk-card desk-nav">
        {/* The whole book; under a tag, this shows everyone again. */}
        {item('/contacts', 'users', t('title'), total, !tagFilter, () =>
          onTag(null),
        )}
        {item('/profile', 'user', t('profile'))}
        {!collapsed && <LanguageRow />}
        {drawer && <ThemeRow />}
        {item('/contacts/duplicates', 'copy', d('title'), duplicates)}
        {item('/contacts/trash', 'trash', tr('menu'), trash)}
        {item('/settings', 'settings', t('settings'))}
        <InstallMenuItem className="desk-nav-item" collapsed={collapsed} />
        <LogoutButton collapsed={collapsed} />
      </nav>
      <div className="desk-card">
        {/* A group, not a region: the details have their own «Tags». */}
        <div className="desk-tags" role="group" aria-labelledby={tagsTitle}>
          <div className="desk-tags-head">
            <h2 id={tagsTitle} className="desk-label">
              {t('tags')}
            </h2>
            <button
              type="button"
              className="desk-tag-new"
              aria-label={t('newTag')}
              title={t('newTag')}
              onClick={onNewTag}
            >
              <Icon name="plus" />
            </button>
          </div>
          <ul>
            {tags.map((tag) => {
              const current = tag.id === tagFilter;
              return (
                <li key={tag.id} className="desk-tag">
                  <button
                    type="button"
                    className={`desk-nav-item${current ? ' is-current' : ''}`}
                    aria-pressed={current}
                    title={collapsed ? tag.name : undefined}
                    onClick={() => onTag(current ? null : tag.id)}
                  >
                    <TagDot color={tag.color} />
                    <span className="desk-label">
                      <bdi>{tag.name}</bdi>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="desk-tag-edit"
                    aria-label={t('tagOptions', { name: tag.name })}
                    onClick={() => onEditTag(tag)}
                  >
                    <Icon name="edit" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
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
    </>
  );
}

// Desktop: always beside the list; the menu button narrows it to icons.
export function DeskSidebar({
  collapsed,
  onToggle,
  ...props
}: SidebarProps & { collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations('Contacts');
  return (
    <aside
      className={`desk-sidebar${collapsed ? ' is-collapsed' : ''}`}
      aria-label={t('sidebar')}
    >
      <SidebarBody
        {...props}
        collapsed={collapsed}
        control={
          <button
            type="button"
            className="desk-collapse"
            aria-label={t(collapsed ? 'expandMenu' : 'collapseMenu')}
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            <Icon name="menu" />
          </button>
        }
      />
    </aside>
  );
}

// Phones and tablets: the same sidebar as a drawer from the menu button.
// Choosing a tag or a tag action closes it.
export function SideDrawer({
  open,
  onClose,
  ...props
}: SidebarProps & { open: boolean; onClose: () => void }) {
  const t = useTranslations('Contacts');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  const closing =
    <T extends unknown[]>(run: (...args: T) => void) =>
    (...args: T) => {
      onClose();
      run(...args);
    };
  return (
    <dialog
      ref={dialog}
      className="side-drawer"
      aria-label={t('menu')}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="side-sheet">
        <SidebarBody
          {...props}
          drawer
          onTag={closing(props.onTag)}
          onNewTag={closing(props.onNewTag)}
          onEditTag={closing(props.onEditTag)}
          control={
            <button
              type="button"
              className="desk-collapse"
              aria-label={t('close')}
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          }
        />
      </div>
    </dialog>
  );
}
