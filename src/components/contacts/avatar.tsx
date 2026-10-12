'use client';
import { useState } from 'react';
import { avatarTone, initial, showInitial, type Contact } from '@/lib/contacts';

export function Avatar({
  contact,
  className = '',
}: {
  contact: Pick<Contact, 'id' | 'name' | 'photoUrl'>;
  className?: string;
}) {
  // A photo that cannot load (offline, or its signed link expired) shows
  // the initial instead.
  const [broken, setBroken] = useState<string | null>(null);
  if (contact.photoUrl && contact.photoUrl !== broken)
    return (
      // Signed photo links expire after minutes; the image optimizer would cache them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={`avatar ${className}`}
        src={contact.photoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(contact.photoUrl)}
      />
    );
  return (
    <span
      className={`avatar avatar-${avatarTone(contact.id)} ${className}`}
      aria-hidden="true"
    >
      {showInitial(initial(contact.name))}
    </span>
  );
}
