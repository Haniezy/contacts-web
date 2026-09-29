import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { isLocale, localeCookie } from './config';

export default getRequestConfig(async () => {
  const value = (await cookies()).get(localeCookie)?.value;
  const locale = isLocale(value) ? value : 'fa';
  return {
    locale,
    timeZone: 'Asia/Tehran',
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
