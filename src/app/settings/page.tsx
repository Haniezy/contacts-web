import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { backendFetch } from '@/lib/backend';
import { AccountShell } from '@/components/account/account-shell';
import { SettingsPanel } from '@/components/account/settings-panel';
import { defaultPalette, isPalette, paletteCookie } from '@/lib/palette';
import app from '../../../package.json';

export default async function Settings() {
  await requireUser();
  const jar = await cookies();
  const response = await backendFetch('auth/2fa/status', jar.toString());
  const chosen = jar.get(paletteCookie)?.value;
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Authentication service unavailable');
  const { enabled } = (await response.json()) as { enabled: boolean };
  return (
    <AccountShell variant="settings">
      <SettingsPanel
        twoFactor={enabled}
        version={app.version}
        palette={isPalette(chosen) ? chosen : defaultPalette}
      />
    </AccountShell>
  );
}
