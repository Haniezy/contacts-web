'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';

// One answer open at a time; it slides open like the settings cards.
export function LandingFaq({
  items,
}: {
  items: { key: string; question: string; answer: string }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="faq-list">
      {items.map(({ key, question, answer }) => {
        const expanded = open === key;
        return (
          <div key={key} className={`faq-item${expanded ? ' is-open' : ''}`}>
            <h3>
              <button
                type="button"
                id={`faq-${key}`}
                aria-expanded={expanded}
                aria-controls={`faq-${key}-answer`}
                onClick={() => setOpen(expanded ? null : key)}
              >
                {question}
                <Icon name="chevron" className="faq-chevron" />
              </button>
            </h3>
            <div
              className="faq-reveal"
              id={`faq-${key}-answer`}
              role="region"
              aria-labelledby={`faq-${key}`}
              inert={!expanded}
            >
              <div>
                <p>{answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
