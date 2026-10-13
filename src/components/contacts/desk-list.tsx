'use client';
import type { ReactNode } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { displayDigits } from '@/lib/api';
import { formatPhone, type Contact } from '@/lib/contacts';
import { Icon } from '@/components/icon';
import { Avatar } from './avatar';

export const deskSizes = [10, 20, 50];
const skeletonRows = 7;

// Desktop: the contacts in pages, the chosen one marked; choosing one opens
// its details beside the list.
export function DeskList({
  contacts,
  total,
  emptyBook,
  page,
  pages,
  size,
  selectedId,
  onSelect,
  onPage,
  onSize,
  addLink,
}: {
  // Undefined while the first page is on its way.
  contacts?: Contact[];
  total?: number;
  // No contacts at all (not a search with no results).
  emptyBook: boolean;
  page: number;
  pages: number;
  size: number;
  selectedId: string | null;
  onSelect: (contact: Contact) => void;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  addLink: (className: string, children: ReactNode) => ReactNode;
}) {
  const t = useTranslations('Contacts');
  const f = useFormatter();
  const locale = useLocale();
  return (
    <section className="desk-list" aria-labelledby="desk-list-title">
      <header className="desk-list-head">
        <h1 id="desk-list-title">
          {t('listTitle')}{' '}
          {total !== undefined && (
            <span className="desk-count">
              {t('listCount', { count: total })}
            </span>
          )}
        </h1>
      </header>
      <div className="desk-rows">
        {!contacts ? (
          <div className="desk-skeleton" aria-hidden="true">
            {Array.from({ length: skeletonRows }, (_, i) => (
              <span key={i} className="desk-row-skeleton">
                <span className="shimmer" />
                <span className="shimmer" />
              </span>
            ))}
            <p className="sr-only" role="status">
              {t('loading')}
            </p>
          </div>
        ) : emptyBook ? (
          <div className="desk-blank">
            <span className="blank-avatar" aria-hidden="true">
              <Icon name="user" />
            </span>
            <h2>{t('emptyTitle')}</h2>
            <p>{t('emptyHelp')}</p>
            {addLink(
              'button-primary blank-add',
              <>
                <Icon name="plus" />
                {t('add')}
              </>,
            )}
          </div>
        ) : contacts.length === 0 ? (
          <p className="desk-empty">{t('noResults')}</p>
        ) : (
          <ul>
            {contacts.map((contact) => {
              const selected = contact.id === selectedId;
              return (
                <li key={contact.id}>
                  <button
                    type="button"
                    className={`desk-row${selected ? ' is-selected' : ''}`}
                    aria-current={selected || undefined}
                    onClick={() => onSelect(contact)}
                  >
                    <Avatar contact={contact} />
                    <span className="desk-row-name">
                      <bdi>{contact.name}</bdi>
                    </span>
                    <span className="desk-row-phone">
                      <bdi dir="ltr">
                        {displayDigits(formatPhone(contact.phone), locale)}
                      </bdi>
                    </span>
                    <Icon name="chevron" className="desk-row-chevron" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {contacts && !emptyBook && (
        <footer className="desk-pager">
          <label className="desk-size">
            <span>{t('perPage')}:</span>
            <select
              value={size}
              onChange={(event) => onSize(Number(event.target.value))}
            >
              {deskSizes.map((option) => (
                <option key={option} value={option}>
                  {f.number(option)}
                </option>
              ))}
            </select>
            <Icon name="chevron" />
          </label>
          <div className="desk-pages">
            <button
              type="button"
              className="pager-previous"
              aria-label={t('previousPage')}
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >
              <Icon name="chevron" />
            </button>
            <span>{t('pageOf', { page, pages: Math.max(pages, 1) })}</span>
            <button
              type="button"
              className="pager-next"
              aria-label={t('nextPage')}
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
            >
              <Icon name="chevron" />
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}
