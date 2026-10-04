import { app } from '@/server/app';

export const dynamic = 'force-dynamic';

// The API (src/server): sign-in and 2FA, contacts and the account.
const handle = (request: Request) => app.handle(request);
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
