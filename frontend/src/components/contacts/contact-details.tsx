'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import { displayDigits } from '@/lib/api';
import { formatPhone, type Contact } from '@/lib/contacts';
import { Avatar } from './avatar';
import { CallLink, ShareButton, SmsLink } from './contact-actions';
import { DeleteDialog } from './delete-dialog';

// Standalone contact page opened from the mobile avatar (and by its address
// on every size). The list's desktop panel shows the same facts in place.
export function ContactDetails({ contact }: { contact: Contact }) {
  const t = useTranslations('Contacts');
  const a = useTranslations('Auth');
  const f = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="contacts-page contact-details-page">
      <div className="contacts-decor" aria-hidden="true">
        <span className="contacts-circle" />
        <span className="contacts-mint" />
        <span className="sphere sphere-1" />
        <span className="sphere sphere-2" />
      </div>
      <header className="details-header">
        <Link href="/contacts" className="contacts-logo">
          <span>
            <Icon name="book" />
          </span>
          {a('brand')}
        </Link>
        <Link
          href="/contacts"
          className="details-back icon-disc"
          aria-label={t('back')}
        >
          <Icon name="back" className="directional-icon" />
        </Link>
      </header>
      <main className="details-main">
        <article className="details-card">
          <div className="panel-decor" aria-hidden="true">
            <span className="panel-mint" />
            <span className="sphere sphere-1" />
            <span className="sphere sphere-2" />
            <span className="sphere sphere-3" />
          </div>
          <div className="panel-hero">
            <Avatar contact={contact} className="avatar-xl" />
            <h1>
              <bdi>{contact.name}</bdi>
            </h1>
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
              onClick={() => setDeleting(true)}
            >
              <Icon name="trash" />
              {t('deleteContact')}
            </button>
          </div>
        </article>
      </main>
      <DeleteDialog
        contact={deleting ? contact : null}
        onCancel={() => setDeleting(false)}
        onDeleted={() => {
          setDeleting(false);
          router.replace('/contacts');
        }}
      />
    </div>
  );
}
