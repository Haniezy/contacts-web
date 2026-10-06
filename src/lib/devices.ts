// A short, readable name for a session's browser and system, from its
// user-agent. Only the common ones are told apart; anything else falls
// back to "unknown". Order matters: Edge and Opera also say "Chrome", and
// Chrome also says "Safari".
const browsers: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const systems: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

export type Device = {
  browser: string | null;
  system: string | null;
  phone: boolean;
};

export function describeDevice(userAgent: string | null): Device {
  const ua = userAgent ?? '';
  const find = (list: [RegExp, string][]) =>
    list.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  return {
    browser: find(browsers),
    system: find(systems),
    phone: /Mobi|iPhone|iPod|Android(?!.*Tablet)/.test(ua),
  };
}
