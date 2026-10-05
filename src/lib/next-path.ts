// Where to go after signing in, from a ?next= parameter. Only the app's own
// signed-in pages are allowed, so the parameter can never send the user to
// another site (//evil.example) or anywhere unexpected.
const allowed =
  /^\/(contacts(\/new|\/duplicates|\/[0-9a-f-]{36}(\/edit)?)?|profile|settings)$/;

export function nextPath(value: unknown) {
  return typeof value === 'string' && allowed.test(value) ? value : null;
}

// The login page's address, carrying the page to return to.
export function loginPath(next?: string | null) {
  const path = nextPath(next);
  // The list is where login goes anyway, so it needs no parameter.
  return path && path !== '/contacts'
    ? `/login?${new URLSearchParams({ next: path })}`
    : '/login';
}
