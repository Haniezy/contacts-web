import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { backendFetch } from '@/lib/backend';
import { AuthShell } from '@/components/auth/auth-shell';
import { SetupForm } from '@/components/auth/setup-form';
export default async function Setup({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  // Opened from settings: every way out of the flow leads back there.
  const done =
    (await searchParams).from === 'settings' ? '/settings' : '/contacts';
  await requireUser();
  const response = await backendFetch(
    'auth/2fa/status',
    (await cookies()).toString(),
  );
  if (response.ok && (await response.json()).enabled) redirect(done);
  return (
    <AuthShell variant="setup">
      <SetupForm done={done} />
    </AuthShell>
  );
}
