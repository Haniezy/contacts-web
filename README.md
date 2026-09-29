# دفترچه تلفن — Contacts

پایه پروژه دفترچه تلفن شخصی با دو سرویس مستقل: **Next.js / React** برای فرانت و **Node.js / Express** برای بک‌اند، هر دو با TypeScript.

این نسخه شامل زیرساخت، دیتابیس، احراز هویت، ورود دومرحله‌ای و **فاز چهار: API مخاطبین** است. بک‌اند از طریق Prisma به PostgreSQL روی Neon متصل می‌شود و CRUD مخاطبین، جست‌وجو، صفحه‌بندی، ادغام تکراری‌ها و اتصال آپلود عکس به Cloudinary دارد. صفحه اصلی موقت است؛ رابط فرم‌ها در فاز فرانت اضافه می‌شود. راهنماها: [نیازمندی‌ها](docs/requirements.fa.md)، [دیتابیس](docs/database.fa.md)، [احراز هویت](docs/auth.fa.md)، [ورود دومرحله‌ای](docs/two-factor.fa.md) و [API مخاطبین](docs/contacts.fa.md).

## اجرای سریع با Docker

پیش‌نیاز: Docker Engine یا Docker Desktop در حال اجرا، به‌همراه Docker Compose v2 یا جدیدتر. اجرای Docker باید برای کاربر فعلی مجاز باشد. اولین build به اینترنت برای دریافت image و بسته‌ها نیاز دارد.

از ریشه پروژه:

```bash
docker compose up
```

همین دستور بدون فایل `.env` هم کار می‌کند؛ Compose از پورت‌های پیش‌فرض استفاده کرده و در اولین اجرا imageها را می‌سازد. برای اجرای پس‌زمینه همراه با انتظار تا سالم‌شدن هر دو سرویس:

```bash
docker compose up --build --wait
docker compose ps
```

| سرویس  | نشانی                 | بررسی سلامت                  |
| ------ | --------------------- | ---------------------------- |
| فرانت  | http://localhost:3000 | http://localhost:3000/health |
| بک‌اند | http://localhost:4000 | http://localhost:4000/health |

پاسخ مورد انتظار فرانت:

```json
{ "status": "ok", "service": "frontend" }
```

پاسخ مورد انتظار بک‌اند:

```json
{ "status": "ok", "service": "backend" }
```

بررسی دستی:

```bash
curl --fail http://localhost:3000/health
curl --fail http://localhost:4000/health
```

در خروجی `docker compose ps` باید هر دو سرویس وضعیت `healthy` داشته باشند. health-checkها در Dockerfile تعریف شده‌اند؛ هر ۱۰ ثانیه HTTP و مقدار `status` را بررسی می‌کنند. `/health` سلامت اجرای سرویس را بررسی می‌کند. مسیر جداگانه `http://localhost:4000/ready` اتصال واقعی دیتابیس را با `SELECT 1` بررسی می‌کند؛ در صورت نبود تنظیمات یا قطع اتصال، کد ۵۰۳ برمی‌گرداند.

دستورهای روزمره:

```bash
docker compose logs -f
docker compose down
docker compose up --build --wait
```

Compose نسخه production سرویس‌ها را اجرا می‌کند. پس از تغییر کد، دوباره با `--build` اجرا کنید. برای توسعه با بازخوانی خودکار، روش اجرای محلی پایین را استفاده کنید. پورت‌ها به `127.0.0.1` متصل‌اند و برای دسترسی از همین کامپیوتر در نظر گرفته شده‌اند.

## متغیرهای محیطی

برای تغییر پورت‌ها و تنظیم اتصال Neon، اگر فایل `.env` ندارید:

```bash
cp .env.example .env
```

| متغیر               | پیش‌فرض | کاربرد                                                 |
| ------------------- | ------- | ------------------------------------------------------ |
| `FRONTEND_PORT`     | `3000`  | پورت فرانت روی میزبان در Compose                       |
| `BACKEND_PORT`      | `4000`  | پورت بک‌اند روی میزبان در Compose                      |
| `DATABASE_URL`      | خالی    | اتصال pooled بک‌اند به Neon                            |
| `DIRECT_URL`        | خالی    | اتصال مستقیم Prisma CLI برای مایگریشن                  |
| `DATABASE_TEST_URL` | خالی    | اجازه صریح اجرای تست‌های دیتابیس روی دیتابیس توسعه/تست |

اگر پورتی اشغال بود، مقدار مربوط را در `.env` تغییر دهید؛ پورت داخل کانتینر ثابت می‌ماند. فایل `.env` را کامیت نکنید. آدرس‌های دیتابیس نباید داخل متغیرهای `NEXT_PUBLIC_*` قرار بگیرند. اتصال‌ها را با TLS و `sslmode=verify-full` تنظیم کنید. بدون تنظیم اتصال، سرویس‌ها و `/health` بالا می‌آیند، ولی `/ready` وضعیت آماده‌نبودن دیتابیس را گزارش می‌کند.

بعد از تنظیم `.env`، مایگریشن را صریح اجرا کنید؛ بالا آمدن سرویس‌ها خودکار دیتابیس را تغییر نمی‌دهد:

```bash
docker compose --profile tools run --rm --build migrate
docker compose up --build --wait
curl --fail http://localhost:4000/ready
```

برای seed نمونه با همان image ابزارها:

```bash
docker compose --profile tools run --rm migrate npm run db:seed
```

## توسعه بدون Docker

برای استفاده از API احراز هویت، `JWT_SECRET`، `APP_ORIGIN` و `AUTH_COOKIE_SECURE` را مطابق [راهنمای Auth](docs/auth.fa.md) در `.env` تنظیم کنید. مسیر `GET /api/auth/me` بدون ورود پاسخ ۴۰۱ می‌دهد.

پیش‌نیاز: Node.js 24 و npm. در صورت استفاده از nvm:

```bash
nvm install
nvm use
```

نصب نسخه‌های قفل‌شده هر سه پوشه:

```bash
npm run setup
```

در ترمینال اول:

```bash
npm run dev:backend
```

در ترمینال دوم:

```bash
npm run dev:frontend
```

فرانت روی ۳۰۰۰ و بک‌اند روی ۴۰۰۰ اجرا می‌شود. برای تغییر پورت اجرای محلی، `PORT` را مستقیم مشخص کنید؛ مقادیر `FRONTEND_PORT` و `BACKEND_PORT` در فایل ریشه مخصوص Compose و smoke test هستند:

```bash
PORT=4100 npm run dev:backend
PORT=3100 npm run dev:frontend
```

## کیفیت کد و بررسی اجرا

از ریشه پروژه، پس از نصب وابستگی‌ها:

```bash
npm run check
```

این دستور به‌ترتیب فرمت، ESLint، TypeScript، تست‌های HTTP بک‌اند و build هر دو سرویس را بررسی می‌کند. Prisma Client هنگام build، typecheck و تست به‌صورت خودکار تولید می‌شود. دستورهای جداگانه:

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

پس از بالا آمدن هر دو سرویس، برای بررسی پاسخ واقعی هر دو health-check و صفحه اصلی:

```bash
npm run smoke
```

اسکریپت smoke به Node.js 24 نیاز دارد ولی وابستگی npm ندارد؛ پورت‌ها را از `.env` ریشه یا محیط می‌خواند. اگر `DATABASE_URL` تنظیم شده باشد، `/ready` را هم بررسی می‌کند. شکست هر بررسی باعث خروج با کد خطا می‌شود.

## ساختار

```text
frontend/
  src/app/              # صفحه موقت، layout و مسیر health
  public/               # فایل‌های عمومی
  Dockerfile            # build چندمرحله‌ای و خروجی standalone
backend/
  src/app.ts            # برنامه Express و مسیر health
  src/server.ts         # اجرای HTTP و خاموش‌شدن کنترل‌شده
  src/config/           # بارگذاری .env ریشه
  src/database/         # Prisma Client مشترک، اتصال و seed
  src/generated/        # خروجی خودکار Prisma؛ خارج از Git
  prisma/               # schema و تاریخچه مایگریشن‌ها
  prisma.config.ts       # تنظیمات Prisma CLI و اتصال مستقیم
  test/                 # تست‌های HTTP و تست‌های یکپارچه دیتابیس
  Dockerfile            # build TypeScript و اجرای وابستگی‌های production
docs/requirements.fa.md  # نیازمندی‌ها و تصمیم‌های باز
docs/database.fa.md      # راهنمای فاز یک
scripts/smoke.mjs        # بررسی HTTP هر دو سرویس در حال اجرا
docker-compose.yml
.env.example
```

هر سرویس `package.json` و `package-lock.json` مستقل دارد؛ بنابراین جداگانه build می‌شود. بسته ریشه برای دستورهای مشترک و Prettier است. ESLint کیفیت کد را بررسی می‌کند و Prettier قالب آن را یکدست نگه می‌دارد. هر دو کانتینر با کاربر غیر root اجرا می‌شوند؛ سورس رمزها و فایل‌های محیطی وارد build context نمی‌شوند.

نسخه ESLint فرانت فعلاً روی ۹ قفل شده، چون پلاگین‌های React در تنظیمات فعلی Next.js با ESLint ۱۰ سازگار نیستند. هشدار پایان پشتیبانی این نسخه هنگام نصب ممکن است دیده شود؛ ارتقای آن باید همراه با نسخه سازگار پلاگین‌ها انجام شود. بک‌اند از ESLint ۱۰ استفاده می‌کند.

Prisma روی نسخه پایدار ۷ قفل شده است. دو وابستگی غیرمستقیم ابزار CLI، `deepmerge-ts` و `mysql2`، با `overrides` به نسخه اصلاح‌شده ارتقا یافته‌اند. مسیر تولید کلاینت، مایگریشن و seed با همین نسخه‌ها بررسی می‌شود؛ این overrideها هنگام ارتقای Prisma باید بازبینی شوند.

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
