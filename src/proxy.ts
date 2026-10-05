import { NextRequest, NextResponse } from 'next/server';
import { loginPath } from '@/lib/next-path';

export function proxy(request: NextRequest) {
  // Optimistic redirect only. The server page and backend independently validate sessions.
  if (!request.cookies.has('contacts_session'))
    return NextResponse.redirect(
      new URL(loginPath(request.nextUrl.pathname), request.url),
    );
  return NextResponse.next();
}
export const config = {
  matcher: ['/contacts/:path*', '/2fa/setup', '/profile', '/settings'],
};
