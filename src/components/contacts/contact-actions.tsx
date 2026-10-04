'use client';
import { useState } from 'react';
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

// Uses the system share sheet where available; otherwise copies the details.
export function ShareButton({ contact }: { contact: Contact }) {
  const t = useTranslations('Contacts');
  const [copied, setCopied] = useState(false);
  async function share() {
    const text = `${contact.name}\n${contact.phone}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: contact.name, text });
      } catch {
        // Dismissing the share sheet is not an error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" className="action action-share" onClick={share}>
      <Icon name="share" />
      <span className="action-label">{t('share')}</span>
      <span className="sr-only" role="status">
        {copied ? t('copied') : ''}
      </span>
    </button>
  );
}
