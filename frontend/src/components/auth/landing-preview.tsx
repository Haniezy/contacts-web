'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

// Order and timing follow the approved landing recording.
const phones = [
  { name: 'login', caption: 'captionLogin' },
  { name: 'contacts', caption: 'captionContacts' },
  { name: 'detail', caption: 'captionDetail' },
] as const;
const introMs = 2300;
const intervalMs = 3700;

export function LandingPreview() {
  const t = useTranslations('Landing');
  const [active, setActive] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  // Choosing a dot stops the automatic rotation.
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    if (stopped || hovered !== null) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced && active !== null) return;
    const timer = setTimeout(
      () => setActive((a) => (a === null ? 0 : (a + 1) % phones.length)),
      active === null ? (reduced ? 0 : introMs) : intervalMs,
    );
    return () => clearTimeout(timer);
  }, [active, hovered, stopped]);
  const shown = hovered ?? active;
  return (
    <div className="landing-preview">
      <div
        className={`landing-phones ${shown === null ? '' : 'has-focus'}`}
        role="img"
        aria-label={t('preview')}
      >
        {phones.map(({ name }, i) => (
          <div
            key={name}
            className={`preview-phone ${shown === i ? 'is-active' : ''}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => {
              setHovered(null);
              setActive(i);
            }}
          >
            {['light', 'dark'].map((theme) => (
              <Image
                key={theme}
                className={`preview-${theme}`}
                src={`/landing/${name}-${theme}.png`}
                alt=""
                width={924}
                height={1832}
                sizes="(max-width: 767px) 53vw, (max-width: 1440px) 31vw, 450px"
                priority={theme === 'light'}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="landing-fade" aria-hidden="true" />
      <div className={`preview-caption ${shown === null ? '' : 'is-visible'}`}>
        <span>{t(phones[shown ?? 0].caption)}</span>
        <div className="preview-dots">
          {phones.map(({ name, caption }, i) => (
            <button
              key={name}
              type="button"
              aria-label={t(caption)}
              aria-pressed={shown === i}
              onClick={() => {
                setActive(i);
                setStopped(true);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
