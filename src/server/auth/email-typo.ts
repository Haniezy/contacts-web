// Spots a misspelt popular mail domain (gmial.com, gmail.co, yaho.com …) and
// returns the intended address; signup rejects the typo.
// Kept in step with the web forms' frontend/src/lib/email.ts.

// Domain names worth checking for typos (5+ letters, so short real domains
// are not mistaken for them), and other real names that only look close.
const providers = [
  'gmail',
  'googlemail',
  'yahoo',
  'ymail',
  'hotmail',
  'outlook',
  'icloud',
  'proton',
  'protonmail',
  'yandex',
];
const known = new Set([...providers, 'email', 'mail', 'live', 'gmx', 'aol']);
// Common slips for "com".
const comTypos = new Set([
  'co',
  'cm',
  'om',
  'con',
  'cmo',
  'comm',
  'cpm',
  'xom',
  'vom',
  'cim',
  'c0m',
]);

// Edit distance with adjacent swaps counted as one edit.
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

export function emailSuggestion(email: string): string | null {
  const at = email.lastIndexOf('@');
  const dot = email.indexOf('.', at);
  if (at < 1 || dot < 0) return null;
  let name = email.slice(at + 1, dot).toLowerCase();
  let ending = email.slice(dot + 1).toLowerCase();
  if (!known.has(name)) {
    const close = providers.find(
      (provider) => distance(name, provider) <= (provider.length >= 7 ? 2 : 1),
    );
    if (!close) return null;
    name = close;
  }
  if (comTypos.has(ending)) ending = 'com';
  const fixed = `${name}.${ending}`;
  return fixed === email.slice(at + 1).toLowerCase()
    ? null
    : `${email.slice(0, at)}@${fixed}`;
}
