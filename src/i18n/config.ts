export const locales = ['fa', 'en'] as const;
export type Locale = (typeof locales)[number];
export const localeCookie = 'contacts-locale';
export function isLocale(value: unknown): value is Locale {
  return value === 'fa' || value === 'en';
}
export function direction(locale: string) {
  return locale === 'fa' ? 'rtl' : 'ltr';
}
