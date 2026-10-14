// The colour themes (Settings › Colour theme), each with a light and a dark
// mode. Kept in a cookie so the server draws the page in it from the start.
export const palettes = ['slate', 'forest', 'terracotta'] as const;
export type Palette = (typeof palettes)[number];
export const paletteCookie = 'contacts-palette';
export const defaultPalette: Palette = 'terracotta';
export const isPalette = (value: unknown): value is Palette =>
  palettes.includes(value as Palette);

// A small preview of each theme in Settings: its accent, its soft tone and
// its text, from the owner's palettes (light mode).
export const paletteSwatches: Record<Palette, string[]> = {
  slate: ['#2f6feb', '#d3dbe4', '#14202b'],
  forest: ['#c49a6c', '#e8d8c3', '#35483c'],
  terracotta: ['#b85c46', '#f2c6ae', '#3c2925'],
};

// Applies a theme at once and keeps it for next time (a year).
export function setPalette(palette: Palette) {
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${paletteCookie}=${palette}; path=/; max-age=31536000; samesite=lax${secure}`;
  document.documentElement.dataset.palette = palette;
}

// Run before the page paints: a page saved for offline use was drawn in
// the theme of its day; the cookie says the current one.
export const paletteScript = `try{var m=document.cookie.match(/(?:^|; )${paletteCookie}=(${palettes.join('|')})(?:;|$)/);if(m)document.documentElement.dataset.palette=m[1]}catch(e){}`;
