'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { Tag, TagColor } from '@/lib/contacts';
import { Icon } from '@/components/icon';

// The tag's colour for its dot, chip or swatch (see --tag-* in the CSS).
export const tagStyle = (color: TagColor) =>
  ({ '--tag': `var(--tag-${color})` }) as CSSProperties;

export function TagDot({ color }: { color: TagColor }) {
  return (
    <span className="tag-dot" style={tagStyle(color)} aria-hidden="true" />
  );
}

// A contact's tags as chips; with `onRemove` each has its own × button.
export function TagChips({
  tags,
  onRemove,
}: {
  tags: Tag[];
  onRemove?: (tag: Tag) => void;
}) {
  const t = useTranslations('Contacts');
  return (
    <ul className="tag-chips">
      {tags.map((tag) => (
        <li key={tag.id} className="tag-chip" style={tagStyle(tag.color)}>
          <bdi>{tag.name}</bdi>
          {onRemove && (
            <button
              type="button"
              aria-label={t('removeTag', { name: tag.name })}
              onClick={() => onRemove(tag)}
            >
              <Icon name="close" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// The form's choice of tags: each one a toggle.
export function TagPicker({
  tags,
  value,
  onChange,
}: {
  tags: Tag[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="tag-picker">
      {tags.map((tag) => {
        const on = value.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            className="tag-chip"
            style={tagStyle(tag.color)}
            aria-pressed={on}
            onClick={() =>
              onChange(
                on ? value.filter((id) => id !== tag.id) : [...value, tag.id],
              )
            }
          >
            <TagDot color={tag.color} />
            <bdi>{tag.name}</bdi>
          </button>
        );
      })}
    </div>
  );
}

// «+ Add tag»: a menu of every tag, ticked when the contact has it.
export function TagMenu({
  tags,
  value,
  onToggle,
}: {
  tags: Tag[];
  value: string[];
  onToggle: (tag: Tag) => void;
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
    // Escape closes this menu only, not the panel around it.
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
  return (
    <div className="more-menu tag-menu" ref={box}>
      <button
        ref={button}
        type="button"
        className="tag-add"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="plus" />
        {t('addTag')}
      </button>
      {open && (
        <div className="more-list" role="menu">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={value.includes(tag.id)}
              onClick={() => onToggle(tag)}
            >
              <TagDot color={tag.color} />
              <bdi>{tag.name}</bdi>
              <Icon name="check" className="tag-check" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
