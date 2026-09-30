export type IconName =
  | 'book'
  | 'search'
  | 'users'
  | 'shield'
  | 'eye'
  | 'eyeOff'
  | 'back'
  | 'copy'
  | 'download';
export function Icon({
  name,
  className = '',
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    book: (
      <>
        <path d="M5 20V5a2 2 0 0 1 2-2h13v17H7a2 2 0 0 0-2 2" />
        <path d="M9 7h7M9 11h5" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M2 21v-2a7 7 0 0 1 14 0v2M16 4a3 3 0 0 1 0 6m3 4a6 6 0 0 1 3 5v2" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6Z" />
        <path d="m8 12 3 3 5-5" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    eyeOff: (
      <>
        <path d="m3 3 18 18M10 5h2c7 0 10 7 10 7a18 18 0 0 1-4 5M6 6a18 18 0 0 0-4 6s3 7 10 7h2" />
      </>
    ),
    back: <path d="M3 12h18m-8-8 8 8-8 8" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="14" rx="2" />
        <path d="M16 4V2H4v16" />
      </>
    ),
    download: (
      <>
        <path d="M12 2v13m-5-5 5 5 5-5M3 16v6h18v-6" />
      </>
    ),
  };
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
