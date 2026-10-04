'use client';
import { useEffect, useRef } from 'react';
import { DayPicker as GregorianPicker } from '@daypicker/react';
import { DayPicker as PersianPicker } from '@daypicker/persian';
import '@daypicker/react/style.css';

// The birthday field's date picker: Jalali in Persian, Gregorian in English.
// Loaded only when the calendar button is pressed (see contact-form.tsx).
export default function BirthdayCalendar({
  locale,
  selected,
  label,
  onSelect,
  onClose,
}: {
  locale: string;
  selected: Date | undefined;
  label: string;
  onSelect: (date: Date) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Escape or a click outside closes it.
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    function press(event: PointerEvent) {
      const field = box.current?.parentElement;
      if (field && !field.contains(event.target as Node)) onClose();
    }
    addEventListener('keydown', key);
    addEventListener('pointerdown', press);
    return () => {
      removeEventListener('keydown', key);
      removeEventListener('pointerdown', press);
    };
  }, [onClose]);

  const today = new Date();
  const Picker = locale === 'fa' ? PersianPicker : GregorianPicker;
  return (
    <div
      ref={box}
      className="birthday-calendar"
      role="dialog"
      aria-label={label}
    >
      <Picker
        mode="single"
        autoFocus
        captionLayout="dropdown"
        selected={selected}
        defaultMonth={selected ?? today}
        startMonth={new Date(1900, 0)}
        endMonth={today}
        disabled={{ after: today }}
        onSelect={(date) => date && onSelect(date)}
      />
    </div>
  );
}
