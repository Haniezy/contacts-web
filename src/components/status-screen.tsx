import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icon';

// Full-page message for missing pages and unexpected errors.
export function StatusScreen({
  icon,
  title,
  text,
  children,
}: {
  icon: IconName;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <main className="status-screen">
      <div className="status-decor" aria-hidden="true">
        <span className="contacts-circle" />
        <span className="contacts-mint" />
      </div>
      <div className="status-card">
        <span className="status-icon icon-disc">
          <Icon name={icon} />
        </span>
        <h1>{title}</h1>
        <p>{text}</p>
        <div className="status-actions">{children}</div>
      </div>
    </main>
  );
}
