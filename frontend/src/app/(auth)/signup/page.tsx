import { redirect } from 'next/navigation';
import { getUser } from '@/lib/session';
import { AuthShell } from '@/components/auth/auth-shell';
import { AccountForm } from '@/components/auth/account-form';
export default async function Signup() {
  if (await getUser()) redirect('/contacts');
  return (
    <AuthShell>
      <AccountForm signup />
    </AuthShell>
  );
}
