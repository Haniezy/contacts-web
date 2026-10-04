# دفترچه تلفن — Contacts

دفترچه تلفن شخصی در **یک پروژه Next.js** (React و TypeScript): صفحه‌ها و API هر دو در همین پروژه‌اند. API روی Node.js در Route Handlerهای Next اجرا می‌شود و از طریق Prisma به PostgreSQL روی Neon وصل است؛ عکس‌ها در Cloudinary ذخیره می‌شوند. راهنماها: [نیازمندی‌ها](docs/requirements.fa.md)، [دیتابیس](docs/database.fa.md)، [احراز هویت](docs/auth.fa.md)، [ورود دومرحله‌ای](docs/two-factor.fa.md) و [API مخاطبین](docs/contacts.fa.md).

## نسخه production

- **سایت:** https://contacts-web-rho.vercel.app (بررسی سلامت: `/health` و `/ready`)

سایت روی Vercel و دیتابیس روی Neon (branch `production`) است؛ هر push به `main` نسخه production را به‌روز می‌کند. جزئیات: [راهنمای استقرار](docs/deployment.fa.md).

## اجرای سریع با Docker

پیش‌نیاز: Docker Engine یا Docker Desktop در حال اجرا، به‌همراه Docker Compose v2 یا جدیدتر.

از ریشه پروژه:

```bash
docker compose up --build --wait
docker compose ps
```

| سرویس  | نشانی                 | بررسی سلامت                  |
| ------ | --------------------- | ---------------------------- |
| برنامه | http://localhost:3000 | http://localhost:3000/health |

پاسخ مورد انتظار `/health`:

```json
{ "status": "ok", "service": "contacts-web" }
```

`/ready` اتصال واقعی دیتابیس را هم بررسی می‌کند و در صورت نبود تنظیمات یا قطع اتصال، کد ۵۰۳ برمی‌گرداند.

- **ArvanCloud:** image پایه (`node:24-bookworm-slim`) از mirror داکر ArvanCloud (`docker.arvancloud.ir`) خوانده می‌شود، نه مستقیم از Docker Hub. برای استفاده از Docker Hub: `docker compose build --build-arg REGISTRY=docker.io`.
- **کش npm:** هنگام build، کش دانلود npm بین buildها می‌ماند (`RUN --mount=type=cache`)؛ اگر فقط کد عوض شود لایه وابستگی‌ها دوباره ساخته نمی‌شود و اگر `package-lock.json` عوض شود هم بسته‌های قبلاً دانلودشده دوباره دانلود نمی‌شوند.

دستورهای روزمره:

```bash
docker compose logs -f
docker compose down
docker compose up --build --wait
```

پس از تغییر کد، دوباره با `--build` اجرا کنید. پورت به `127.0.0.1` متصل است و فقط از همین کامپیوتر در دسترس است.

## متغیرهای محیطی

```bash
cp .env.example .env
```

| متغیر                                     | کاربرد                                                   |
| ----------------------------------------- | -------------------------------------------------------- |
| `APP_PORT`                                | پورت برنامه روی میزبان در Compose (پیش‌فرض ۳۰۰۰)         |
| `DATABASE_URL`                            | اتصال pooled به Neon                                     |
| `DIRECT_URL`                              | اتصال مستقیم Prisma CLI برای مایگریشن                    |
| `DATABASE_TEST_URL`                       | اجازه صریح اجرای تست‌ها روی دیتابیس توسعه/تست            |
| `JWT_SECRET`، `TWO_FACTOR_ENCRYPTION_KEY` | کلیدهای نشست و رمز 2FA ([راهنمای Auth](docs/auth.fa.md)) |
| `APP_ORIGIN`، `AUTH_COOKIE_SECURE`        | نشانی سایت و کوکی امن                                    |
| `CLOUDINARY_*`                            | ذخیره عکس‌ها                                             |

فایل `.env` را کامیت نکنید. آدرس‌های دیتابیس نباید داخل متغیرهای `NEXT_PUBLIC_*` قرار بگیرند. مایگریشن را صریح اجرا کنید؛ بالا آمدن برنامه دیتابیس را تغییر نمی‌دهد:

```bash
docker compose --profile tools run --rm --build migrate
```

## توسعه بدون Docker

پیش‌نیاز: Node.js 24 و npm.

```bash
npm ci
npm run dev
```

برنامه روی http://localhost:3000 اجرا می‌شود و `.env` ریشه را خودش می‌خواند.

## کیفیت کد و تست

```bash
npm run check
```

به‌ترتیب فرمت، ESLint، TypeScript، تست‌های واحد و build را بررسی می‌کند. دستورهای جداگانه:

| دستور                                                      | بررسی                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm test`                                                 | تست‌های واحد API (بدون دیتابیس)                                              |
| `npm run test:auth`، `test:2fa`، `test:account`، `test:db` | تست‌های یکپارچه API روی `DATABASE_TEST_URL`                                  |
| `npm run test:contacts`                                    | تست‌های API مخاطبین و عکس                                                    |
| `npm run test:e2e`                                         | تست‌های مرورگر (Playwright) روی دسکتاپ، موبایل و تبلت؛ پس از `npm run build` |
| `npm run smoke`                                            | بررسی سلامت، صفحه اصلی و دیتابیس برنامه در حال اجرا                          |

## ساختار

```text
src/app/                # صفحه‌ها (App Router)، /api/[...path]، /health و /ready
src/components/         # اجزای رابط کاربری
src/lib/                # کمک‌های مشترک صفحه‌ها (session، API مرورگر، تاریخ شمسی)
src/server/             # API: مسیرها، احراز هویت و 2FA، مخاطبین، حساب، دیتابیس
src/server/http.ts      # روتر کوچک به سبک Express روی Request/Response وب
src/server/generated/   # خروجی خودکار Prisma؛ خارج از Git
prisma/                 # schema و تاریخچه مایگریشن‌ها
messages/               # متن‌های فارسی و انگلیسی
tests/server/           # تست‌های API (node:test)
tests/e2e/              # تست‌های مرورگر (Playwright)
docs/                   # راهنماها
scripts/smoke.mjs       # بررسی برنامه در حال اجرا
Dockerfile              # build چندمرحله‌ای، خروجی standalone Next.js
docker-compose.yml      # برنامه و ابزار مایگریشن
```

یک `package.json` و یک `package-lock.json` برای کل پروژه. API در فرایند خود Next.js اجرا می‌شود: مرورگر مستقیم `/api/...` را صدا می‌زند و صفحه‌های سروری همان API را درون همان فرایند و بدون درخواست شبکه فراخوانی می‌کنند (`src/lib/backend.ts`). مسیرها و middlewareهای API با روتر کوچک `src/server/http.ts` نوشته شده‌اند که همان شکل Express را دارد.

Prisma روی نسخه پایدار ۷ قفل شده است. دو وابستگی غیرمستقیم ابزار CLI، `deepmerge-ts` و `mysql2`، با `overrides` به نسخه اصلاح‌شده ارتقا یافته‌اند.

## قرارداد کامیت

هر کامیت یک تغییر مشخص و قابل توضیح داشته باشد:

- `chore:` تنظیم ابزارها، Docker و مستندات.
- `feat:` اضافه‌کردن قابلیت.
- `fix:` برطرف‌کردن خطا.

مثال: `feat: add backend health endpoint`.

## منابع فنی

- [نصب و تنظیم Next.js](https://nextjs.org/docs/app/getting-started/installation)
- [استقرار Next.js و خروجی standalone](https://nextjs.org/docs/app/getting-started/deploying)
- [چرخه انتشار Node.js](https://github.com/nodejs/Release)

## فرانت: تم و زبان

راهنمای پیاده‌سازی، ساختار و تست‌های مرورگر در [مستندات فاز ۵](docs/frontend.fa.md) آمده است. صفحه موقت موجود کنترل‌های تم و زبان را برای بررسی نمایش می‌دهد؛ طراحی صفحات در فازهای بعد انجام می‌شود.

## لندینگ و ورود

مسیرهای فاز ۶، قرارداد فرم‌ها و اتصال امن به API در [راهنمای احراز هویت فرانت](docs/auth-frontend.fa.md) آمده است. برای تست‌های مرورگر، دیتابیس تست مهاجرت‌شده و `npm run build` لازم است.

## صفحه مخاطبین

فهرست، جست‌وجو، اکشن‌ها، منو و حذف فاز ۷ در [راهنمای صفحه مخاطبین](docs/contacts-frontend.fa.md) آمده است. فرم مشترک مخاطب جدید و ویرایش (فاز ۸) در [راهنمای فرم مخاطب](docs/contact-form.fa.md) آمده است. فهرست تکراری‌ها و ادغام (فاز ۹) در [راهنمای تکراری‌ها](docs/duplicates.fa.md) آمده است. پروفایل و تنظیمات (فاز ۱۰) در [راهنمای حساب کاربری](docs/account.fa.md) آمده است. ریسپانسیو، حالت‌های لودینگ و خطا، دسترسی‌پذیری و تست‌های سه‌اندازه (فاز ۱۱) در [راهنمای پولیش](docs/polish.fa.md) آمده است.
