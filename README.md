# Contacts (دفترچه تلفن)

A personal phone book in **one Next.js project** (React and TypeScript): the pages and the API live in the same project. The API runs on Node.js in Next.js Route Handlers and reaches PostgreSQL on Neon through Prisma; photos are stored on Cloudinary.

**Live:** [contacts-web-rho.vercel.app](https://contacts-web-rho.vercel.app)

## Features

- **Secure sign-in:** Argon2 password hashing, two-factor authentication with one-time codes and recovery codes, a list of signed-in devices with remote sign-out, and rate limiting.
- **Contacts:** add, edit and search (by name or number, Persian digits included), a photo cropped in the browser, a birthday in the Persian (Jalali) calendar, and a note.
- **Colour tags**, **public share links** and a **trash** that keeps deleted contacts for seven days.
- **Duplicates:** finds the same number written in different forms (`+98`, `0098`, `0`) and merges contacts field by field.
- **Offline (PWA):** the book opens without a connection, and changes are saved exactly once when it comes back.
- **Persian and English** (right-to-left and left-to-right), light and dark themes with three colour palettes, for phones, tablets and desktops.
- **Tests:** Playwright scenarios on three screen sizes, accessibility checks with axe, and API tests.

## Production

- **Site:** https://contacts-web-rho.vercel.app (health checks: `/health` and `/ready`)

The site runs on Vercel and the database on Neon (branch `production`); every push to `main` updates production. Details: [deployment guide](docs/deployment.fa.md) (Persian).

## Quick start with Docker

Requirements: Docker Engine or Docker Desktop running, with Docker Compose v2 or later.

From the project root:

```bash
docker compose up --build --wait
docker compose ps
```

| Service | Address               | Health check                 |
| ------- | --------------------- | ---------------------------- |
| App     | http://localhost:3000 | http://localhost:3000/health |

Expected `/health` response:

```json
{ "status": "ok", "service": "contacts-web" }
```

`/ready` also checks the real database connection and returns 503 when the settings are missing or the connection is down.

- **ArvanCloud:** the base image (`node:24-bookworm-slim`) is pulled from ArvanCloud's Docker mirror (`docker.arvancloud.ir`), not directly from Docker Hub. To use Docker Hub: `docker compose build --build-arg REGISTRY=docker.io`.
- **npm cache:** the npm download cache is kept between builds (`RUN --mount=type=cache`). If only the code changes, the dependency layer is not rebuilt; if `package-lock.json` changes, packages already downloaded are not downloaded again.

Everyday commands:

```bash
docker compose logs -f
docker compose down
docker compose up --build --wait
```

After changing the code, run again with `--build`. The port is bound to `127.0.0.1`, so the app is reachable from this computer only.

## Environment variables

```bash
cp .env.example .env
```

| Variable                                  | Purpose                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| `APP_PORT`                                | The app's host port in Compose (default 3000)                   |
| `DATABASE_URL`                            | Pooled connection to Neon                                       |
| `DIRECT_URL`                              | Direct connection for the Prisma CLI (migrations)               |
| `DATABASE_TEST_URL`                       | Explicit permission to run tests on a development/test database |
| `JWT_SECRET`, `TWO_FACTOR_ENCRYPTION_KEY` | Session and 2FA keys ([auth guide](docs/auth.fa.md), Persian)   |
| `APP_ORIGIN`, `AUTH_COOKIE_SECURE`        | The site's origin and secure cookies                            |
| `CLOUDINARY_*`                            | Photo storage                                                   |

Never commit `.env`. Database addresses must not go into `NEXT_PUBLIC_*` variables. Run migrations explicitly; starting the app never changes the database:

```bash
docker compose --profile tools run --rm --build migrate
```

## Development without Docker

Requirements: Node.js 24 and npm.

```bash
npm ci
npm run dev
```

The app runs on http://localhost:3000 and reads `.env` from the project root.

## Code quality and tests

```bash
npm run check
```

Runs formatting, ESLint, TypeScript, unit tests and the build, in that order. Separate commands:

| Command                                                    | Checks                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm test`                                                 | API unit tests (no database)                                                   |
| `npm run test:auth`, `test:2fa`, `test:account`, `test:db` | API integration tests on `DATABASE_TEST_URL`                                   |
| `npm run test:contacts`                                    | Contacts and photo API tests                                                   |
| `npm run test:e2e`                                         | Browser tests (Playwright) on desktop, phone and tablet; after `npm run build` |
| `npm run smoke`                                            | Health, home page and database of a running app                                |

## Structure

```text
src/app/                # pages (App Router), /api/[...path], /health and /ready
src/components/         # UI components
src/lib/                # helpers shared by the pages (session, browser API, Jalali dates)
src/server/             # API: routes, authentication and 2FA, contacts, account, database
src/server/http.ts      # a small Express-style router on web Request/Response
src/server/generated/   # Prisma's generated client; not in Git
prisma/                 # schema and migration history
messages/               # Persian and English texts
tests/server/           # API tests (node:test)
tests/e2e/              # browser tests (Playwright)
docs/                   # guides (Persian)
scripts/smoke.mjs       # checks a running app
Dockerfile              # multi-stage build, Next.js standalone output
docker-compose.yml      # the app and the migration tool
```

One `package.json` and one `package-lock.json` for the whole project. The API runs inside the Next.js process: the browser calls `/api/...` directly, and server-rendered pages call the same API in-process without a network request (`src/lib/backend.ts`). API routes and middleware use the small router in `src/server/http.ts`, shaped like Express.

Prisma is pinned to stable version 7. Two indirect dependencies of its CLI, `deepmerge-ts` and `mysql2`, are raised to patched versions with `overrides`.

## Commit convention

Each commit makes one clear, explainable change:

- `chore:` tooling, Docker and documentation.
- `feat:` a new feature.
- `fix:` a bug fix.

Example: `feat: add backend health endpoint`.

## Documentation (Persian)

- [Requirements](docs/requirements.fa.md), [database](docs/database.fa.md), [authentication](docs/auth.fa.md), [two-factor sign-in](docs/two-factor.fa.md) and the [contacts API](docs/contacts.fa.md)
- [Theme and language](docs/frontend.fa.md), [landing and sign-in](docs/auth-frontend.fa.md) (browser tests need a migrated test database and `npm run build`)
- [Contacts page](docs/contacts-frontend.fa.md), [contact form](docs/contact-form.fa.md), [duplicates and merging](docs/duplicates.fa.md), [profile and settings](docs/account.fa.md)
- [Responsive layout, loading and error states, accessibility and three-size tests](docs/polish.fa.md), [offline mode](docs/pwa.fa.md), [design system](docs/design-system.fa.md)

## Technical references

- [Installing Next.js](https://nextjs.org/docs/app/getting-started/installation)
- [Deploying Next.js and standalone output](https://nextjs.org/docs/app/getting-started/deploying)
- [Node.js release schedule](https://github.com/nodejs/Release)
