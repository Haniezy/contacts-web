import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import { displayDigits } from '@/lib/api';
import { formatPhone } from '@/lib/contacts';
import { Avatar } from './avatar';
import { CallLink, CopyNumberButton, SmsLink } from './contact-actions';

export type SharedContactData = {
  name: string;
  phone: string;
  photoUrl: string | null;
};

// What someone sees when a contact is shared with them: the details page's
// card with only the name, number and photo, and no account controls.
export function SharedContact({
  contact,
  token,
}: {
  contact: SharedContactData;
  token: string;
}) {
  const t = useTranslations('Shared');
  const a = useTranslations('Auth');
  const locale = useLocale();
  return (
    <div className="contacts-page contact-details-page shared-page">
      <div className="contacts-decor" aria-hidden="true">
        <span className="contacts-circle" />
        <span className="contacts-mint" />
        <span className="sphere sphere-1" />
        <span className="sphere sphere-2" />
      </div>
      <div className="details-decor" aria-hidden="true">
        <span className="form-circle" />
        <span className="form-mint" />
        <span className="sphere sphere-1" />
        <span className="sphere sphere-2" />
      </div>
      <header className="details-header">
        <Link href="/" className="contacts-logo">
          <span>
            <Icon name="book" />
          </span>
          {a('brand')}
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
            {/* The code only picks the avatar colour. */}
            <Avatar contact={{ ...contact, id: token }} className="avatar-xl" />
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
            <CopyNumberButton phone={contact.phone} />
          </div>
          <div className="shared-note">
            <p>{t('note')}</p>
            <Link href="/" className="text-link">
              {t('cta')}
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}
