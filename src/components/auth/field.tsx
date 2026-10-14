'use client';
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icon';
export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  error?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  // Unique even with two forms on the page (sign-in and sign-up slide).
  const id = useId();
  const t = useTranslations('Auth');
  const password = props.type === 'password';
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="field-line">
        <input
          {...props}
          id={id}
          type={password && visible ? 'text' : props.type}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {password && (
          <button
            type="button"
            className="password-toggle"
            aria-label={t(visible ? 'hidePassword' : 'showPassword')}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            <Icon name={visible ? 'eyeOff' : 'eye'} />
          </button>
        )}
      </div>
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
