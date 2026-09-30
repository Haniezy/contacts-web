'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
export function LandingPreview() {
  const [paused, setPaused] = useState(false);
  const t = useTranslations('Landing');
  return (
    <>
      <div
        className={`landing-phones ${paused ? 'is-paused' : ''}`}
        role="img"
        aria-label={t('preview')}
        dir="ltr"
      >
        {['detail', 'contacts', 'login'].map((name, i) => (
          <div
            key={name}
            className={`preview-phone phone-${i}`}
            aria-hidden="true"
          >
            {['light', 'dark'].map((theme) => (
              <Image
                key={theme}
                className={`preview-${theme}`}
                src={`/landing/${name}-${theme}.png`}
                alt=""
                width={924}
                height={1832}
                sizes="(max-width: 640px) 46vw, 28vw"
                priority={theme === 'light'}
              />
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="preview-pause text-link"
        onClick={() => setPaused(!paused)}
      >
        {t(paused ? 'play' : 'pause')}
      </button>
    </>
  );
}
