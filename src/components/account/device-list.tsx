'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { describeDevice } from '@/lib/devices';
import { Icon } from '@/components/icon';

type Session = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  current: boolean;
};

// The devices this account is signed in on, each with its own sign-out.
// Loaded when the section opens, so it is always fresh.
export function DeviceList({ open }: { open: boolean }) {
  const t = useTranslations('Account');
  const f = useFormatter();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const { sessions } = await api<{ sessions: Session[] }>(
        'account/sessions',
      );
      setFailed(false);
      setSessions(sessions);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        return location.replace('/login');
      setFailed(true);
    }
  }, []);
  // Loaded once with the page, so the list is ready when the card opens and
  // nothing below it jumps (a click on "sign out of all" must not miss).
  // While open it stays fresh: again whenever this tab comes back into view
  // (say, after signing in elsewhere), and every 30 seconds while visible.
  useEffect(() => {
    let current = true;
    const refresh = () =>
      api<{ sessions: Session[] }>('account/sessions')
        .then(({ sessions }) => {
          if (!current) return;
          setFailed(false);
          setSessions(sessions);
        })
        .catch((error) => {
          if (error instanceof ApiError && error.status === 401)
            return location.replace('/login');
          if (current) setFailed(true);
        });
    const whenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    // Closing the card needs no new request; the first load and every
    // opening do.
    if (open || !loaded.current) void refresh();
    loaded.current = true;
    if (!open)
      return () => {
        current = false;
      };
    document.addEventListener('visibilitychange', whenVisible);
    addEventListener('focus', whenVisible);
    const timer = setInterval(whenVisible, 30_000);
    return () => {
      current = false;
      document.removeEventListener('visibilitychange', whenVisible);
      removeEventListener('focus', whenVisible);
      clearInterval(timer);
    };
  }, [open]);

  async function signOut(id: string) {
    setRemoving(id);
    try {
      await api(`account/sessions/${id}`, undefined, { method: 'DELETE' });
      setSessions((current) => current?.filter((s) => s.id !== id) ?? null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        return location.replace('/login');
      // Already gone elsewhere, or a failure: show the list as it is now.
      await load();
    } finally {
      setRemoving(null);
    }
  }

  const name = (session: Session) => {
    const { browser, system } = describeDevice(session.userAgent);
    if (browser && system) return t('deviceOn', { browser, system });
    return browser ?? system ?? t('unknownDevice');
  };

  if (failed)
    return (
      <p role="alert" className="form-error">
        {t('devicesFailed')}
      </p>
    );
  if (!sessions)
    return (
      <p className="device-loading" role="status">
        {t('devicesLoading')}
      </p>
    );
  return (
    <ul className="device-list" aria-label={t('devices')}>
      {sessions.map((session) => {
        const label = name(session);
        const used = new Date(session.lastSeenAt ?? session.createdAt);
        return (
          <li key={session.id} className="device-row">
            <span className="device-icon" aria-hidden="true">
              <Icon
                name={
                  describeDevice(session.userAgent).phone
                    ? 'smartphone'
                    : 'monitor'
                }
              />
            </span>
            <span className="device-text">
              <span className="device-name">
                {/* Our own sentence, so it follows the page's direction:
                    «Chrome روی Windows», not reordered by its first word. */}
                <span className="device-label">{label}</span>
                {session.current && (
                  <span className="status-chip">{t('thisDevice')}</span>
                )}
              </span>
              <span className="device-time">
                {session.current
                  ? t('activeNow')
                  : t('lastActive', { time: f.relativeTime(used) })}
                {' · '}
                {t('signedIn', {
                  date: f.dateTime(new Date(session.createdAt), {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </span>
            </span>
            {!session.current && (
              <button
                type="button"
                className="device-signout"
                disabled={removing === session.id}
                aria-label={t('signOutDeviceLabel', { device: label })}
                onClick={() => signOut(session.id)}
              >
                {t('signOutDevice')}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
