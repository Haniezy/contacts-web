'use client';
import { useRef } from 'react';
import { useLocale, useTranslations, useFormatter } from 'next-intl';
import { asciiDigits, displayDigits } from '@/lib/api';
export function CodeInput({
  value,
  onChange,
  invalid = false,
  onPastedKey,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  // A pasted setup key (letters and digits, 16+ long) is not a code; its
  // digits would fill the boxes with a wrong code, so it is refused.
  onPastedKey?: () => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const locale = useLocale();
  const t = useTranslations('Auth');
  const f = useFormatter();
  function insert(text: string, index: number) {
    const digits = asciiDigits(text)
      .replace(/\D/g, '')
      .slice(0, 6 - index);
    if (!digits) return;
    const next = value.padEnd(6, ' ').split('');
    for (let i = 0; i < digits.length; i++) next[index + i] = digits[i];
    onChange(next.join('').trimEnd());
    refs.current[Math.min(index + digits.length, 5)]?.focus();
  }
  return (
    <div className="otp-fields" dir="ltr" role="group" aria-label={t('code')}>
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={t('digit', { number: f.number(i + 1) })}
          aria-invalid={invalid}
          inputMode="numeric"
          onFocus={(event) => event.target.select()}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          value={displayDigits(value[i]?.trim() ?? '', locale)}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData('text');
            if (/[a-z]/i.test(text) && text.replace(/\s/g, '').length >= 16)
              return onPastedKey?.();
            insert(text, i);
          }}
          onChange={(event) => {
            if (!event.target.value) {
              const next = value.split('');
              next[i] = ' ';
              onChange(next.join('').trimEnd());
            } else insert(event.target.value, i);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace') {
              event.preventDefault();
              const next = value.padEnd(6, ' ').split('');
              if (next[i] !== ' ') {
                next[i] = ' ';
              } else if (i > 0) {
                next[i - 1] = ' ';
                refs.current[i - 1]?.focus();
              }
              onChange(next.join('').trimEnd());
            }
            if (event.key === 'ArrowLeft' && i > 0)
              refs.current[i - 1]?.focus();
            if (event.key === 'ArrowRight' && i < 5)
              refs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}
