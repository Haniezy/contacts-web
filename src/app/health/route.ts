import { app } from '@/server/app';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => app.handle(request);
