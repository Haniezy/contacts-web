'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import type { Contact } from '@/lib/contacts';
import { Avatar } from './avatar';
import { CallLink, ShareButton, SmsLink } from './contact-actions';

const desktop = '(min-width: 1024px)';

export function ContactRow({
  contact,
  expanded,
  selected,
  onToggle,
  onDelete,
}: {
  contact: Contact;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('Contacts');
  const actionsId = `actions-${contact.id}`;
  return (
    <li
      className={`contact-row${expanded ? ' is-open' : ''}`}
      aria-current={selected || undefined}
    >
      <div className="row-head">
        {/* Mobile opens the details page; desktop shows it in the side panel. */}
        <Link
          href={`/contacts/${contact.id}`}
          prefetch={false}
          className="row-avatar"
          aria-label={t('details', { name: contact.name })}
          onClick={(event) => {
            if (matchMedia(desktop).matches) {
              event.preventDefault();
              onToggle();
            }
          }}
        >
          <Avatar contact={contact} />
        </Link>
        <button
          type="button"
          className="row-toggle"
          aria-expanded={expanded}
          aria-controls={actionsId}
          onClick={onToggle}
        >
          <bdi>{contact.name}</bdi>
          <Icon name="chevron" />
        </button>
      </div>
      <div className="row-actions" id={actionsId} inert={!expanded}>
        <div>
          <CallLink phone={contact.phone} />
          <SmsLink phone={contact.phone} />
          <ShareButton contact={contact} />
          <Link
            href={`/contacts/${contact.id}/edit`}
            prefetch={false}
            className="action action-edit"
          >
            <Icon name="edit" />
            <span className="action-label">{t('edit')}</span>
          </Link>
          <button
            type="button"
            className="action action-delete"
            onClick={onDelete}
          >
            <Icon name="trash" />
            <span className="action-label">{t('delete')}</span>
          </button>
        </div>
      </div>
    </li>
  );
}
