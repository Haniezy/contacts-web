'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
import { install, installState, runningInstalled } from '@/lib/install';

const subscribeNothing = () => () => {};

// "Install the app" in the sidebar, only where the browser offers installing
// (Chrome, Edge, Samsung) and not when already running as the installed app.
export function InstallMenuItem({
  className,
  collapsed = false,
}: {
  className: string;
  collapsed?: boolean;
}) {
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
    <>
      <button
        type="button"
        className={className}
        title={collapsed ? t('menu') : undefined}
        onClick={() => setOpen(true)}
      >
        <Icon name="download" />
        <span className="desk-label">{t('menu')}</span>
      </button>
      {open && <InstallSheet onClose={() => setOpen(false)} />}
    </>
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
