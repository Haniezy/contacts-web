// Jalali ↔ Gregorian conversion, after the jalaali-js algorithm (MIT, Behrang Noruzi Niya).
const breaks = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
  2262, 2324, 2394, 2456, 3178,
];
const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

function jalCal(jy: number) {
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;
  for (let i = 1; i < breaks.length; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const gy = jy + 621;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march: 20 + leapJ - leapG };
}

function g2d(gy: number, gm: number, gd: number) {
  const d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gm = mod(div(i, 153), 12) + 1;
  return {
    gy: div(j, 1461) - 100100 + div(8 - gm, 6),
    gm,
    gd: div(mod(i, 153), 5) + 1,
  };
}

export function jalaliMonthLength(jy: number, jm: number) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalCal(jy).leap === 0 ? 30 : 29;
}

export function toGregorian(jy: number, jm: number, jd: number) {
  const { gy, march } = jalCal(jy);
  return d2g(
    g2d(gy, 3, march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1,
  );
}

export function toJalali(gy: number, gm: number, gd: number) {
  const jdn = g2d(gy, gm, gd);
  let jy = gy - 621;
  const { leap, march } = jalCal(jy);
  let k = jdn - g2d(gy, 3, march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

const pad = (value: number) => String(value).padStart(2, '0');

// Accepts d/m/y or y/m/d with any separator and Persian or Latin digits,
// and is lenient: digits typed without separators (۱۳۸۳۲۳ → ۱۳۸۳/۲/۳ or
// ۰۳۰۲۱۳۸۳), two-digit years (۸۳ → ۱۳۸۳) and, in Persian, a Gregorian year.
// Persian dates are Jalali; English dates are Gregorian. The first reading
// that is a real date wins. Returns YYYY-MM-DD.
export function parseBirthday(text: string, locale: string) {
  const parts = text
    .replace(/[۰-۹٠-٩]/g, (d) =>
      String(d.charCodeAt(0) - (d >= '۰' ? 1776 : 1632)),
    )
    .split(/\D+/)
    .filter(Boolean);
  for (const [y, m, d] of readings(parts)) {
    const iso = toIso(fullYear(y, locale), Number(m), Number(d), locale);
    if (iso) return iso;
  }
  return null;
}

// Possible [year, month, day] splits, most likely first.
function readings(parts: string[]): string[][] {
  if (parts.length === 3)
    return parts[0].length > 2 || Number(parts[0]) > 31
      ? [parts]
      : [[parts[2], parts[1], parts[0]]];
  if (parts.length !== 1) return [];
  const s = parts[0];
  const cut = (...sizes: number[]) => {
    const out: string[] = [];
    let at = 0;
    for (const size of sizes) out.push(s.slice(at, (at += size)));
    return out;
  };
  // Four-digit years first (year first, then day/month/year), then
  // two-digit years, day first like the field's own format.
  const shapes: Record<number, [number[], 'ymd' | 'dmy'][]> = {
    8: [
      [[4, 2, 2], 'ymd'],
      [[2, 2, 4], 'dmy'],
    ],
    7: [
      [[4, 2, 1], 'ymd'],
      [[4, 1, 2], 'ymd'],
      [[2, 1, 4], 'dmy'],
      [[1, 2, 4], 'dmy'],
    ],
    6: [
      [[4, 1, 1], 'ymd'],
      [[1, 1, 4], 'dmy'],
      [[2, 2, 2], 'dmy'],
      [[2, 2, 2], 'ymd'],
    ],
  };
  return (shapes[s.length] ?? []).map(([sizes, order]) => {
    const [a, b, c] = cut(...sizes);
    return order === 'ymd' ? [a, b, c] : [c, b, a];
  });
}

function fullYear(text: string, locale: string) {
  const year = Number(text);
  if (text.length > 2) return year;
  const now = new Date();
  const current =
    locale === 'fa'
      ? toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate()).jy
      : now.getFullYear();
  const century = current - (current % 100);
  return century + year <= current ? century + year : century - 100 + year;
}

function toIso(y: number, m: number, d: number, locale: string) {
  if (m < 1 || m > 12 || d < 1) return null;
  if (locale === 'fa' && y >= 1200 && y <= 1500) {
    if (d > jalaliMonthLength(y, m)) return null;
    const g = toGregorian(y, m, d);
    return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1800 || y > 2200 || date.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Editable day/month/year text for a stored date.
export function birthdayInput(iso: string, locale: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (locale !== 'fa') return `${pad(d)}/${pad(m)}/${y}`;
  const j = toJalali(y, m, d);
  return `${j.jd}/${j.jm}/${j.jy}`.replace(/\d/g, (n) => '۰۱۲۳۴۵۶۷۸۹'[+n]);
}
