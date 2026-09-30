import { avatarTone, initial, type Contact } from '@/lib/contacts';

export function Avatar({
  contact,
  className = '',
}: {
  contact: Pick<Contact, 'id' | 'name' | 'photoUrl'>;
  className?: string;
}) {
  if (contact.photoUrl)
    return (
      // Signed photo links expire after minutes; the image optimizer would cache them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={`avatar ${className}`}
        src={contact.photoUrl}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  return (
    <span
      className={`avatar avatar-${avatarTone(contact.id)} ${className}`}
      aria-hidden="true"
    >
      {initial(contact.name)}
    </span>
  );
}
