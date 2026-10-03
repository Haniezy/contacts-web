import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  // Optimistic redirect only. The server page and backend independently validate sessions.
  if (!request.cookies.has('contacts_session'))
    return NextResponse.redirect(new URL('/login', request.url));
  return NextResponse.next();
}
export const config = {
  matcher: ['/contacts/:path*', '/2fa/setup', '/profile', '/settings'],
};
