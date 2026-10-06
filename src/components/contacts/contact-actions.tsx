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

type Note = 'copied' | 'numberCopied' | 'copyFailed';

// Copies text and briefly shows a note at the bottom of the page.
function useCopy() {
  const t = useTranslations('Contacts');
  const [note, setNote] = useState<Note | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy(text: string, done: Note) {
    let shown: Note = done;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      shown = 'copyFailed';
    }
    setNote(shown);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 2500);
  }
  const status = (
    <>
      <span className="sr-only" role="status">
        {note ? t(note) : ''}
      </span>
      {note &&
        createPortal(
          <p
            className={`copy-toast${note === 'copyFailed' ? ' is-failed' : ''}`}
            aria-hidden="true"
          >
            <Icon name={note === 'copyFailed' ? 'alert' : 'copy'} />
            {t(note)}
          </p>,
          document.body,
        )}
    </>
  );
  return { copy, status };
}

// The contact's public link (/s/<code>): anyone who gets it sees the name,
// number and photo without signing in. Touch screens with a share sheet
// send it with the name and number; elsewhere the link is copied.
export function ShareButton({
  contact,
}: {
  contact: Pick<Contact, 'name' | 'phone' | 'shareToken'>;
}) {
  const t = useTranslations('Contacts');
  const { copy, status } = useCopy();
  async function share() {
    const url = `${location.origin}/s/${contact.shareToken}`;
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
    await copy(url, 'copied');
  }
  return (
    <button type="button" className="action action-share" onClick={share}>
      <Icon name="share" />
      <span className="action-label">{t('share')}</span>
      {status}
    </button>
  );
}

// On the shared page: copy the number (calling is no use on a computer).
export function CopyNumberButton({ phone }: { phone: string }) {
  const t = useTranslations('Contacts');
  const { copy, status } = useCopy();
  return (
    <button
      type="button"
      className="action action-copy"
      onClick={() => copy(phone, 'numberCopied')}
    >
      <Icon name="copy" />
      <span className="action-label">{t('copyNumber')}</span>
      {status}
    </button>
  );
}
