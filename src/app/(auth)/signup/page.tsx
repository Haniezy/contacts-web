import { redirect } from 'next/navigation';
import { getUser } from '@/lib/session';
import { AuthCard } from '@/components/auth/auth-card';
export default async function Signup() {
  if (await getUser()) redirect('/contacts');
  return <AuthCard initial="signup" />;
}
