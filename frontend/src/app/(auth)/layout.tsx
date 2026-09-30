import { EnrollmentProvider } from '@/components/auth/enrollment-context';
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EnrollmentProvider>{children}</EnrollmentProvider>;
}
