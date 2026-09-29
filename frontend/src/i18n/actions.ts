'use server';

import { cookies, headers } from 'next/headers';
import { isLocale, localeCookie } from './config';

export async function setLocale(value: string) {
  if (!isLocale(value)) throw new Error('Unsupported locale');
  const requestHeaders = await headers();
  (await cookies()).set(localeCookie, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: requestHeaders.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
