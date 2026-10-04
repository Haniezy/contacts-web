import { stringifySetCookie, type SetCookie } from 'cookie';
import { clientIp } from './auth/client-ip';

// A small Express-style router on web Request/Response. The API keeps its
// routes and middleware this way while running inside the Next.js app
// (src/app/api/[...path]/route.ts), with no separate server.

export type CookieOptions = Omit<SetCookie, 'name' | 'value'>;

export class Req {
  readonly method: string;
  readonly url: URL;
  readonly headers: Record<string, string>;
  // Relative to the router the request is in, like Express.
  path: string;
  params: Record<string, string> = {};
  query: Record<string, string | string[]> = {};
  body: unknown = undefined;
  file?: { buffer: Buffer; mimetype: string; size: number };

  constructor(readonly raw: Request) {
    this.method = raw.method.toUpperCase();
    this.url = new URL(raw.url);
    this.path = this.url.pathname;
    this.headers = Object.fromEntries(
      [...raw.headers].map(([key, value]) => [key.toLowerCase(), value]),
    );
    for (const [key, value] of this.url.searchParams) {
      const current = this.query[key];
      this.query[key] =
        current === undefined
          ? value
          : Array.isArray(current)
            ? [...current, value]
            : [current, value];
    }
  }

  get(name: string) {
    return this.headers[name.toLowerCase()];
  }

  // Whether the body's media type is the given one (e.g. application/json).
  is(type: string) {
    return (
      this.get('content-type')?.split(';')[0]?.trim().toLowerCase() === type
    );
  }
}

export class Res {
  statusCode = 200;
  readonly headers = new Headers();
  locals: Record<string, unknown> = {};
  headersSent = false;
  private payload: string | null = null;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  set(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }

  json(data: unknown) {
    this.headers.set('Content-Type', 'application/json; charset=utf-8');
    this.payload = JSON.stringify(data);
    this.headersSent = true;
  }

  end() {
    this.headersSent = true;
  }

  cookie(name: string, value: string, options: CookieOptions = {}) {
    this.headers.append(
      'Set-Cookie',
      stringifySetCookie({ name, value, ...options }),
    );
    return this;
  }

  clearCookie(name: string, options: CookieOptions = {}) {
    const { maxAge: _maxAge, ...rest } = options;
    void _maxAge;
    return this.cookie(name, '', { ...rest, expires: new Date(0) });
  }

  toResponse() {
    const empty = this.statusCode === 204 || this.statusCode === 304;
    return new Response(empty ? null : this.payload, {
      status: this.statusCode,
      headers: this.headers,
    });
  }
}

export type Next = (error?: unknown) => void;
export type Handler = (req: Req, res: Res, next: Next) => unknown;

type Layer = {
  method?: string;
  pattern: RegExp;
  keys: string[];
  prefix: boolean;
  handlers: (Handler | Router)[];
};

function compile(path: string, prefix: boolean) {
  const keys: string[] = [];
  const body = path
    .replace(/\/+$/, '')
    .split('/')
    .map((part) => {
      if (!part.startsWith(':'))
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      keys.push(part.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return {
    keys,
    pattern: new RegExp(`^${body}${prefix ? '(?=/|$)' : '/?$'}`, 'i'),
  };
}

// Runs one handler; resolves to true when it passed the request on.
async function run(handler: Handler, req: Req, res: Res) {
  let proceed = false;
  let failure: unknown;
  await handler(req, res, (error) => {
    if (error) failure = error;
    else proceed = true;
  });
  if (failure) throw failure;
  return proceed;
}

export class Router {
  private layers: Layer[] = [];

  use(...args: [string | Handler | Router, ...(Handler | Router)[]]) {
    const path = typeof args[0] === 'string' ? (args.shift() as string) : '/';
    this.layers.push({
      ...compile(path, true),
      prefix: true,
      handlers: args as (Handler | Router)[],
    });
    return this;
  }

  private route(method: string, path: string, handlers: Handler[]) {
    this.layers.push({
      ...compile(path, false),
      method,
      prefix: false,
      handlers,
    });
    return this;
  }

  get(path: string, ...handlers: Handler[]) {
    return this.route('GET', path, handlers);
  }
  post(path: string, ...handlers: Handler[]) {
    return this.route('POST', path, handlers);
  }
  patch(path: string, ...handlers: Handler[]) {
    return this.route('PATCH', path, handlers);
  }
  delete(path: string, ...handlers: Handler[]) {
    return this.route('DELETE', path, handlers);
  }

  // Resolves to true when no handler finished the request.
  async handle(req: Req, res: Res): Promise<boolean> {
    for (const layer of this.layers) {
      if (layer.method && layer.method !== req.method) continue;
      const found = layer.pattern.exec(req.path);
      if (!found) continue;
      const saved = { path: req.path, params: req.params };
      req.params = {
        ...req.params,
        ...Object.fromEntries(
          layer.keys.map((key, i) => [key, decodeURIComponent(found[i + 1])]),
        ),
      };
      if (layer.prefix) req.path = req.path.slice(found[0].length) || '/';
      try {
        for (const handler of layer.handlers) {
          const proceed =
            handler instanceof Router
              ? await handler.handle(req, res)
              : await run(handler, req, res);
          if (!proceed) return false;
        }
      } finally {
        req.path = saved.path;
        req.params = saved.params;
      }
    }
    return true;
  }
}

// Reads at most `limit` bytes of the body; larger bodies are an error.
async function readBody(req: Req, limit: number) {
  const declared = Number(req.get('content-length'));
  if (declared > limit) throw new BodyError('entity.too.large');
  if (!req.raw.body) return Buffer.alloc(0);
  const reader = req.raw.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new BodyError('entity.too.large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export class BodyError extends Error {
  constructor(readonly type: 'entity.too.large' | 'entity.parse.failed') {
    super(type);
  }
}

// JSON bodies up to `limit` bytes, objects or arrays only (like express.json).
export function json({ limit }: { limit: number }): Handler {
  return async (req, _res, next) => {
    if (req.body !== undefined || !req.is('application/json')) return next();
    const text = (await readBody(req, limit)).toString('utf8');
    if (!text.trim()) return next();
    if (!/^\s*[[{]/.test(text)) throw new BodyError('entity.parse.failed');
    try {
      req.body = JSON.parse(text);
    } catch {
      throw new BodyError('entity.parse.failed');
    }
    next();
  };
}

// The error a photo upload ends with; LIMIT_FILE_SIZE answers 413.
export class UploadError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

// One image file in the multipart field `field`, at most `maxBytes`.
export function singleFile({
  field,
  maxBytes,
  types,
  invalidType,
  invalidBody,
}: {
  field: string;
  maxBytes: number;
  types: string[];
  invalidType: () => Error;
  invalidBody: () => Error;
}): Handler {
  return async (req, _res, next) => {
    let bytes: Buffer;
    try {
      bytes = await readBody(req, maxBytes + 64 * 1024);
    } catch {
      throw new UploadError('LIMIT_FILE_SIZE');
    }
    let form: FormData;
    try {
      form = await new Request(req.url, {
        method: 'POST',
        headers: { 'Content-Type': req.get('content-type') ?? '' },
        body: new Uint8Array(bytes),
      }).formData();
    } catch {
      throw invalidBody();
    }
    const entries = [...form.entries()];
    if (entries.some(([, value]) => typeof value === 'string'))
      throw new UploadError('LIMIT_FIELD_COUNT');
    if (entries.some(([name]) => name !== field))
      throw new UploadError('LIMIT_UNEXPECTED_FILE');
    if (entries.length > 1) throw new UploadError('LIMIT_FILE_COUNT');
    const file = entries[0]?.[1];
    if (file instanceof File) {
      if (!types.includes(file.type)) throw invalidType();
      if (file.size > maxBytes) throw new UploadError('LIMIT_FILE_SIZE');
      req.file = {
        buffer: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        size: file.size,
      };
    }
    next();
  };
}

// Counts requests per visitor in memory, per running instance.
export function rateLimit({
  windowMs,
  limit,
  message,
}: {
  windowMs: number;
  limit: number;
  message: unknown;
}): Handler {
  // Browser tests share one counter, so they raise every limit.
  limit *= Number(process.env.RATE_LIMIT_SCALE) || 1;
  const hits = new Map<string, { count: number; resetAt: number }>();
  const policy = `"${limit}-in-${Math.round(windowMs / 60000)}min"`;
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10000)
      for (const [key, hit] of hits) if (hit.resetAt <= now) hits.delete(key);
    const key = clientIp(req);
    let hit = hits.get(key);
    if (!hit || hit.resetAt <= now) {
      hit = { count: 0, resetAt: now + windowMs };
      hits.set(key, hit);
    }
    hit.count += 1;
    const seconds = Math.ceil((hit.resetAt - now) / 1000);
    res.set('RateLimit-Policy', `${policy}; q=${limit}; w=${windowMs / 1000}`);
    res.set(
      'RateLimit',
      `${policy}; r=${Math.max(0, limit - hit.count)}; t=${seconds}`,
    );
    if (hit.count > limit) {
      res.set('Retry-After', String(seconds));
      res.status(429).json(message);
      return;
    }
    next();
  };
}
