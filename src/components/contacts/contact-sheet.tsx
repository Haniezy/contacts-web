'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { displayDigits } from '@/lib/api';
import { formatPhone, tagsOf, type Contact, type Tag } from '@/lib/contacts';
import { Icon, type IconName } from '@/components/icon';
import { Avatar } from './avatar';
import {
  CallLink,
  CopyIconButton,
  ShareButton,
  SmsLink,
} from './contact-actions';
import { TagChips, TagMenu } from './tags';

// A small menu under its button: edit and delete. Escape or a click
// elsewhere closes it.
function MoreMenu({
  trigger,
  onEdit,
  onDelete,
}: {
  trigger: (props: {
    open: boolean;
    toggle: () => void;
    ref: React.Ref<HTMLButtonElement>;
  }) => ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('Contacts');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    // Caught first, and marked as handled: Escape closes this menu only,
    // not the panel around it.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key, true);
    };
  }, [open]);
  const item = (icon: IconName, label: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
  return (
    <div className="more-menu" ref={box}>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: button })}
      {open && (
        <div className="more-list" role="menu">
          {item('edit', t('editContact'), onEdit)}
          {item('trash', t('deleteContact'), onDelete)}
        </div>
      )}
    </div>
  );
}

// Desktop: the chosen contact beside the list. The close button sits on
// its outer edge; the menu above the photo and the pencil in the note edit
// it, and its tags come off (×) or on («+») right here.
export function ContactSheet({
  contact,
  tags,
  onTags,
  onClose,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  // All of the user's tags.
  tags: Tag[];
  onTags: (tagIds: string[]) => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('Contacts');
  const f = useFormatter();
  const locale = useLocale();
  const phone = displayDigits(formatPhone(contact.phone), locale);
  const tagIds = contact.tagIds ?? [];
  return (
    <article className="desk-sheet" aria-labelledby="sheet-name">
      <div className="sheet-top">
        <MoreMenu
          onEdit={onEdit}
          onDelete={onDelete}
          trigger={({ open, toggle, ref }) => (
            <button
              ref={ref}
              type="button"
              className="sheet-kebab"
              aria-label={t('moreOptions')}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={toggle}
            >
              <Icon name="kebab" />
            </button>
          )}
        />
        <button
          type="button"
          className="sheet-close"
          aria-label={t('closeDetails')}
          onClick={onClose}
        >
          <Icon name="back" />
        </button>
      </div>
      <div className="sheet-hero">
        <div className="sheet-photo">
          <Avatar contact={contact} className="avatar-xl" />
        </div>
        <h2 id="sheet-name">
          <bdi>{contact.name}</bdi>
        </h2>
      </div>
      <div className="sheet-actions">
        <CallLink phone={contact.phone} />
        <SmsLink phone={contact.phone} />
        <ShareButton contact={contact} />
      </div>
      <div className="sheet-info">
        <div>
          <Icon name="phone" />
          <p className="sheet-info-label">{t('mobileNumber')}</p>
          <p className="sheet-info-value">
            <bdi dir="ltr">{phone}</bdi>
          </p>
          <CopyIconButton phone={contact.phone} />
        </div>
        <div>
          <Icon name="calendar" />
          <p className="sheet-info-label">{t('birthday')}</p>
          <p className="sheet-info-value">
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
      <section className="sheet-note" aria-labelledby="sheet-note-title">
        <div className="sheet-note-head">
          <h3 id="sheet-note-title">{t('reminder')}</h3>
          <button
            type="button"
            className="sheet-note-edit"
            aria-label={t('editReminder')}
            onClick={onEdit}
          >
            <Icon name="edit" />
          </button>
        </div>
        <p>
          <bdi>{contact.reminder || t('notSet')}</bdi>
        </p>
      </section>
      {tags.length > 0 && (
        <section className="sheet-tags" aria-labelledby="sheet-tags-title">
          <h3 id="sheet-tags-title">
            <Icon name="tag" />
            {t('tags')}
          </h3>
          <div className="sheet-tags-body">
            <TagChips
              tags={tagsOf(contact, tags)}
              onRemove={(tag) => onTags(tagIds.filter((id) => id !== tag.id))}
            />
            <TagMenu
              tags={tags}
              value={tagIds}
              onToggle={(tag) =>
                onTags(
                  tagIds.includes(tag.id)
                    ? tagIds.filter((id) => id !== tag.id)
                    : [...tagIds, tag.id],
                )
              }
            />
          </div>
        </section>
      )}
    </article>
  );
}
