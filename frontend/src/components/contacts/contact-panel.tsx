'use client';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import { displayDigits } from '@/lib/api';
import { formatPhone, type Contact } from '@/lib/contacts';
import { Avatar } from './avatar';
import { CallLink, ShareButton, SmsLink } from './contact-actions';

// Desktop side panel: the selected contact, or the empty state.
export function ContactPanel({
  contact,
  duplicates,
  onDelete,
}: {
  contact: Contact | null;
  duplicates: number;
  onDelete: (contact: Contact) => void;
}) {
  const t = useTranslations('Contacts');
  const f = useFormatter();
  const locale = useLocale();
  return (
    <aside className="contact-panel">
      <div className="panel-decor" aria-hidden="true">
        <span className="panel-mint" />
        <span className="sphere sphere-1" />
        <span className="sphere sphere-2" />
        <span className="sphere sphere-3" />
      </div>
      {contact ? (
        <>
          <div className="panel-hero">
            <Avatar contact={contact} className="avatar-xl" />
            <h2>
              <bdi>{contact.name}</bdi>
            </h2>
            <p className="panel-phone" dir="ltr">
              {displayDigits(formatPhone(contact.phone), locale)}
            </p>
          </div>
          <div className="panel-actions">
            <CallLink phone={contact.phone} />
            <SmsLink phone={contact.phone} />
            <ShareButton contact={contact} />
          </div>
          <div className="panel-cards">
            <div className="info-card">
              <span className="info-icon info-birthday">
                <Icon name="calendar" />
              </span>
              <div>
                <p>{t('birthday')}</p>
                <p className="info-value">
                  {contact.birthday
                    ? f.dateTime(new Date(contact.birthday), {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })
                    : t('notSet')}
                </p>
              </div>
            </div>
            <div className="info-card">
              <span className="info-icon info-reminder">
                <Icon name="bell" />
              </span>
              <div>
                <p>{t('reminder')}</p>
                <p className="info-value">
                  <bdi>{contact.reminder || t('notSet')}</bdi>
                </p>
              </div>
            </div>
          </div>
          <div className="panel-buttons">
            <Link
              href={`/contacts/${contact.id}/edit`}
              prefetch={false}
              className="button-primary"
            >
              <Icon name="edit" />
              {t('editContact')}
            </Link>
            <button
              type="button"
              className="button-danger"
              onClick={() => onDelete(contact)}
            >
              <Icon name="trash" />
              {t('deleteContact')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="panel-hero panel-empty">
            <span className="panel-user">
              <Icon name="user" />
            </span>
            <h2>{t('selectTitle')}</h2>
            <p>{t('selectHelp')}</p>
            <Link
              href="/contacts/new"
              prefetch={false}
              className="button-primary"
            >
              <Icon name="plus" />
              {t('addContact')}
            </Link>
          </div>
          {duplicates > 0 && (
            <div className="duplicates-card">
              <span className="info-icon info-merge">
                <Icon name="users" />
              </span>
              <div>
                <p className="duplicates-title">
                  {t('duplicatesFound', { count: duplicates })}
                </p>
                <p>{t('duplicatesHelp')}</p>
              </div>
              <Link
                href="/contacts/duplicates"
                prefetch={false}
                className="text-link"
              >
                {t('review')}
              </Link>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
