import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'دفترچه تلفن',
  description: 'دفترچه تلفن شخصی',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
