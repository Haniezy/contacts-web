import { useLocale, useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import { LandingFaq } from '@/components/auth/landing-faq';
import { PreferenceIcon } from '@/components/preferences/icons';
import { LanguageSwitch } from '@/components/preferences/language-switch';
import { ThemeSwitch } from '@/components/preferences/theme-switch';
import { displayDigits } from '@/lib/api';

const contactEmail = 'mshzolfaghari@gmail.com';

const features = [
  ['anywhere', 'book', 'mint'],
  ['search', 'search', 'sky'],
  ['duplicates', 'users', 'lilac'],
  ['birthday', 'calendar', 'coral'],
  ['actions', 'phone', 'amber'],
  ['preferences', 'globe', 'slate'],
] as const;
const security = [
  ['private', 'user', 'sky'],
  ['twoFactor', 'shield', 'mint'],
  ['sessions', 'logout', 'lilac'],
  ['delete', 'trash', 'coral'],
] as const;
const questions = [
  'what',
  'devices',
  'newPhone',
  'duplicates',
  'twoFactor',
  'birthday',
  'deleteAccount',
] as const;

export function LandingSections() {
  const t = useTranslations('Landing');
  return (
    <div className="landing-more">
      <section className="landing-section" aria-labelledby="features-title">
        <h2 id="features-title">{t('featuresTitle')}</h2>
        <p className="landing-lead">{t('featuresSubtitle')}</p>
        <ul className="feature-grid">
          {features.map(([key, icon, tint]) => (
            <li key={key} className="landing-card">
              <span className={`landing-icon tint-${tint}`}>
                {icon === 'globe' ? (
                  <PreferenceIcon name="globe" />
                ) : (
                  <Icon name={icon} />
                )}
              </span>
              <h3>{t(`features.${key}.title`)}</h3>
              <p>{t(`features.${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section" aria-labelledby="security-title">
        <h2 id="security-title">{t('securityTitle')}</h2>
        <p className="landing-lead">{t('securitySubtitle')}</p>
        <ul className="security-grid">
          {security.map(([key, icon, tint]) => (
            <li key={key} className="landing-card security-card">
              <span className={`landing-icon tint-${tint}`}>
                <Icon name={icon} />
              </span>
              <div>
                <h3>{t(`security.${key}.title`)}</h3>
                <p>{t(`security.${key}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section" aria-labelledby="faq-title">
        <h2 id="faq-title">{t('faqTitle')}</h2>
        <LandingFaq
          items={questions.map((key) => ({
            key,
            question: t(`faq.${key}.q`),
            answer: t(`faq.${key}.a`),
          }))}
        />
      </section>

      <section
        className="landing-section about-card"
        aria-labelledby="about-title"
      >
        <h2 id="about-title">{t('aboutTitle')}</h2>
        <p>{t('aboutText1')}</p>
        <p>{t('aboutText2')}</p>
        <p className="about-contact">
          {t('contactPrompt')}{' '}
          <a href={`mailto:${contactEmail}`} dir="ltr">
            {contactEmail}
          </a>
        </p>
      </section>
    </div>
  );
}

export function LandingFooter({ version }: { version: string }) {
  const a = useTranslations('Auth');
  const s = useTranslations('Account');
  const locale = useLocale();
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div className="footer-brand">
          <p className="landing-logo">
            <span>
              <Icon name="book" />
            </span>
            {a('brand')}
          </p>
          <p className="footer-version">
            {s('version', { version: displayDigits(version, locale) })}
          </p>
        </div>
        <div className="footer-preferences">
          <LanguageSwitch />
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  );
}
