'use client';
import { createContext, useContext, useState } from 'react';
export type Enrollment = {
  secret: string;
  qrCodeDataUrl: string;
  expiresAt: string;
};
const Context = createContext<{
  enrollment: Enrollment | null;
  setEnrollment: (value: Enrollment | null) => void;
} | null>(null);
export function EnrollmentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  return (
    <Context.Provider value={{ enrollment, setEnrollment }}>
      {children}
    </Context.Provider>
  );
}
export function useEnrollment() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing enrollment provider');
  return value;
}
