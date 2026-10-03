import { accountUser, requireUser } from '@/lib/session';
import { AccountShell } from '@/components/account/account-shell';
import { ProfileForm } from '@/components/account/profile-form';

export default async function Profile() {
  const user = await requireUser();
  return (
    <AccountShell variant="profile">
      <ProfileForm
        user={accountUser(user)}
        initialName={`${user.firstName} ${user.lastName}`.trim()}
      />
    </AccountShell>
  );
}
