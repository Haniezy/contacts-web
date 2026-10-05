'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import type { Contact } from '@/lib/contacts';

export function CallLink({ phone }: { phone: string }) {
  const t = useTranslations('Contacts');
  return (
    <a href={`tel:${phone}`} className="action action-call">
      <Icon name="phone" />
      <span className="action-label">{t('call')}</span>
    </a>
  );
}

export function SmsLink({ phone }: { phone: string }) {
  const t = useTranslations('Contacts');
  return (
    <a href={`sms:${phone}`} className="action action-sms">
      <Icon name="message" />
      <span className="action-label">{t('sms')}</span>
    </a>
  );
}

// Phones (touch screens with a share sheet): the system sheet with the
// name, number and the contact's link, so a contact can still be sent to
// someone. Elsewhere the link is copied; pasting it in a new tab opens just
// this contact (after signing in, if needed).
export function ShareButton({ contact }: { contact: Contact }) {
  const t = useTranslations('Contacts');
  const [note, setNote] = useState<'copied' | 'copyFailed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function show(next: 'copied' | 'copyFailed') {
    setNote(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 2500);
  }
  async function share() {
    const url = `${location.origin}/contacts/${contact.id}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({
          title: contact.name,
          text: `${contact.name}\n${contact.phone}`,
          url,
        });
      } catch {
        // Dismissing the share sheet is not an error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      show('copied');
    } catch {
      show('copyFailed');
    }
  }
  return (
    <button type="button" className="action action-share" onClick={share}>
      <Icon name="share" />
      <span className="action-label">{t('share')}</span>
      <span className="sr-only" role="status">
        {note ? t(note) : ''}
      </span>
      {note &&
        createPortal(
          <p
            className={`copy-toast${note === 'copyFailed' ? ' is-failed' : ''}`}
            aria-hidden="true"
          >
            <Icon name={note === 'copied' ? 'copy' : 'alert'} />
            {t(note)}
          </p>,
          document.body,
        )}
    </button>
  );
}
