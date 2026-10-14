'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  palettes,
  paletteSwatches,
  setPalette,
  type Palette,
} from '@/lib/palette';

// Settings › Colour theme: the three themes, each with its light and dark
// mode (switched from the menu as before). A choice applies at once.
export function PaletteChooser({ initial }: { initial: Palette }) {
  const t = useTranslations('Account');
  const [chosen, setChosen] = useState(initial);
  return (
    <fieldset className="palette-card">
      <legend>{t('palette')}</legend>
      <p className="settings-help">{t('paletteHelp')}</p>
      <div className="palette-options">
        {palettes.map((palette) => (
          <label key={palette} className="palette-option">
            <input
              type="radio"
              name="palette"
              value={palette}
              checked={chosen === palette}
              onChange={() => {
                setPalette(palette);
                setChosen(palette);
              }}
            />
            <span className="palette-swatches" aria-hidden="true">
              {paletteSwatches[palette].map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </span>
            <span className="palette-name">{t(`palettes.${palette}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
