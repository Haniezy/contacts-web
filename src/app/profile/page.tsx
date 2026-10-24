import { accountUser, requireUser } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/page-shell';
import { ProfileForm } from '@/components/account/profile-form';

export default async function Profile() {
  const user = await requireUser();
  const t = await getTranslations('Account');
  return (
    <PageShell title={t('profileTitle')}>
      <ProfileForm
        user={accountUser(user)}
        initialName={`${user.firstName} ${user.lastName}`.trim()}
      />
    </PageShell>
  );
}
