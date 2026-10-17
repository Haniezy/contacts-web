// The two-step verification pages (sign-in and sign-up have their own card):
// one card in the middle of the landing page's blurred picture.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="landing-backdrop" aria-hidden="true" />
      <section className="auth-shell-card">{children}</section>
    </main>
  );
}
