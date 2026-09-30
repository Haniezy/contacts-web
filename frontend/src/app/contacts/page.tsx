import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { backendFetch } from '@/lib/backend';
import { Preferences } from '@/components/preferences/preferences';
import { LogoutButton } from '@/components/auth/logout-button';
export default async function Contacts() {
  const user = await requireUser();
  const t = await getTranslations('Contacts');
  const f = await getFormatter();
  const response = await backendFetch(
    'contacts?page=1&pageSize=20',
    (await cookies()).toString(),
  );
  if (response.status === 401) redirect('/login');
  const data = response.ok ? await response.json() : null;
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <LogoutButton />
      </div>
      <p className="mt-2 text-ink2">
        <bdi>{user.email}</bdi>
      </p>
      <p className="mt-6 text-ink2">{t('phaseNote')}</p>
      {!data ? (
        <p role="alert" className="form-error">
          {t('failed')}
        </p>
      ) : data.contacts.length === 0 ? (
        <p className="card mt-6 p-8">{t('empty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {data.contacts.map(
            (contact: { id: string; name: string; phone: string }) => (
              <li
                className="card flex items-center justify-between gap-4 p-5"
                key={contact.id}
              >
                <bdi>{contact.name}</bdi>
                <bdi>
                  {contact.phone.replace(/\d/g, (d) => f.number(Number(d)))}
                </bdi>
              </li>
            ),
          )}
        </ul>
      )}
      <Link href="/2fa/setup" className="text-link mt-6 inline-block">
        {t('security')}
      </Link>
      <Preferences />
    </main>
  );
}
