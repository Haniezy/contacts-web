import { redirect } from 'next/navigation';
import { getUser } from '@/lib/session';
import { nextPath } from '@/lib/next-path';
import { AuthShell } from '@/components/auth/auth-shell';
import { AccountForm } from '@/components/auth/account-form';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // A page to return to after signing in, such as a copied contact link.
  const next = nextPath((await searchParams).next);
  if (await getUser()) redirect(next ?? '/contacts');
  return (
    <AuthShell variant="login">
      <AccountForm next={next} />
    </AuthShell>
  );
}
