import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { nextPath } from '@/lib/next-path';
import { AuthShell } from '@/components/auth/auth-shell';
import { VerifyForm } from '@/components/auth/verify-form';
export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!(await cookies()).has('contacts_2fa_challenge')) redirect('/login');
  return (
    <AuthShell variant="verify">
      <VerifyForm next={nextPath((await searchParams).next)} />
    </AuthShell>
  );
}
