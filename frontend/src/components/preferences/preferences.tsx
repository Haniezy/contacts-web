import { useTranslations } from 'next-intl';
import { LanguageSwitch } from './language-switch';
import { ThemeSwitch } from './theme-switch';
import { PreferenceIcon } from './icons';

// Shared controls: place in the mobile menu or desktop header in the relevant phase.
export function Preferences() {
  const t = useTranslations('Preferences');
  return (
    <section
      aria-label={t('title')}
      className="preferences card mt-8 p-6 sm:p-8"
    >
      <div className="preference-row">
        <span className="preference-label">
          <span className="preference-icon theme-icon">
            <span className="sun-icon">
              <PreferenceIcon name="sun" />
            </span>
            <span className="moon-icon">
              <PreferenceIcon name="moon" />
            </span>
          </span>
          {t('theme')}
        </span>
        <ThemeSwitch />
      </div>
      <div className="preference-row">
        <span className="preference-label">
          <span className="preference-icon language-icon">
            <PreferenceIcon name="globe" />
          </span>
          {t('language')}
        </span>
        <LanguageSwitch />
      </div>
    </section>
  );
}
