import { redirect } from 'next/navigation';
import { getUser } from '@/lib/session';
import { nextPath } from '@/lib/next-path';
import { AuthCard } from '@/components/auth/auth-card';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // A page to return to after signing in, such as a copied contact link.
  const next = nextPath((await searchParams).next);
  if (await getUser()) redirect(next ?? '/contacts');
  return <AuthCard initial="login" next={next} />;
}
