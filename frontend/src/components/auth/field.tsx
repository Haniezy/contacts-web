'use client';
import { useState, type InputHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from './icon';
export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  const t = useTranslations('Auth');
  const password = props.type === 'password';
  return (
    <div className="auth-field">
      <label htmlFor={props.name}>{label}</label>
      <div className="field-line">
        <input
          {...props}
          id={props.name}
          type={password && visible ? 'text' : props.type}
          aria-invalid={!!error}
          aria-describedby={error ? `${props.name}-error` : undefined}
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
        <p className="field-error" id={`${props.name}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
