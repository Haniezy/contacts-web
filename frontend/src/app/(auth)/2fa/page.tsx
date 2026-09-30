import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { VerifyForm } from '@/components/auth/verify-form';
export default async function Verify() {
  if (!(await cookies()).has('contacts_2fa_challenge')) redirect('/login');
  return (
    <AuthShell variant="verify">
      <VerifyForm />
    </AuthShell>
  );
}
