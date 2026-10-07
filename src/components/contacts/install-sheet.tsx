'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import { install, installState, runningInstalled } from '@/lib/install';

const subscribeNothing = () => () => {};

// "Install the app" in the menu, only where the browser offers installing
// (Chrome, Edge, Samsung) and not when already running as the installed app.
export function InstallMenuItem() {
  const t = useTranslations('Install');
  const [open, setOpen] = useState(false);
  const installed = useSyncExternalStore(
    subscribeNothing,
    runningInstalled,
    () => true,
  );
  const { offer } = useSyncExternalStore(
    installState.subscribe,
    installState.get,
    installState.server,
  );
  // Kept while open so the "installed" note can show after the offer is used.
  if (installed || (!offer && !open)) return null;
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
  const dialog = useRef<HTMLDialogElement>(null);
  const { offer, installed } = useSyncExternalStore(
    installState.subscribe,
    installState.get,
    installState.server,
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
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
        </>
      )}
      <button type="button" className="text-link" onClick={onClose}>
        {t('close')}
      </button>
    </dialog>
  );
}
