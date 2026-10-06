'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import {
  install,
  installState,
  platform,
  runningInstalled,
  type Platform,
} from '@/lib/install';

const subscribeNothing = () => () => {};

// "Install the app" in the menu: hidden once running as the installed app.
// It opens a short guide for this device, with the browser's own install
// button on top where the browser offers one (Chrome, Edge, Samsung).
export function InstallMenuItem() {
  const t = useTranslations('Install');
  const [open, setOpen] = useState(false);
  const installed = useSyncExternalStore(
    subscribeNothing,
    runningInstalled,
    () => true,
  );
  if (installed) return null;
  return (
    <li>
      <button type="button" className="menu-link" onClick={() => setOpen(true)}>
        <span className="menu-icon icon-install">
          <Icon name="download" />
        </span>
        <span className="menu-text">
          {t('menu')}
          <span className="menu-subtext">{t('menuHelp')}</span>
        </span>
      </button>
      {open && <InstallSheet onClose={() => setOpen(false)} />}
    </li>
  );
}

function InstallSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations('Install');
  const f = useFormatter();
  const dialog = useRef<HTMLDialogElement>(null);
  const { offer, installed } = useSyncExternalStore(
    installState.subscribe,
    installState.get,
    installState.server,
  );
  const device = useSyncExternalStore<Platform>(
    subscribeNothing,
    platform,
    () => 'desktop',
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const steps: Record<Platform, string[]> = {
    ios: [t('iosStep1'), t('iosStep2')],
    android: [t('androidStep1'), t('androidStep2')],
    desktop: [t('desktopStep1'), t('desktopStep2')],
  };
  return (
    <dialog
      ref={dialog}
      className="install-sheet"
      aria-labelledby="install-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Image src="/icons/icon-192.png" alt="" width={64} height={64} />
      <h2 id="install-title">{t('title')}</h2>
      {installed ? (
        <p role="status">{t('done')}</p>
      ) : (
        <>
          <p>{t('help')}</p>
          {offer && (
            <button
              type="button"
              className="button-primary"
              onClick={() => void install()}
            >
              <Icon name="download" />
              {t('install')}
            </button>
          )}
          <p className="install-manual">
            {offer ? t('orManually') : t('manually')}
          </p>
          <ol className="install-steps">
            {steps[device].map((step, i) => (
              <li key={i}>
                <span className="install-number">{f.number(i + 1)}</span>
                {step}
              </li>
            ))}
          </ol>
        </>
      )}
      <button type="button" className="text-link" onClick={onClose}>
        {t('close')}
      </button>
    </dialog>
  );
}
