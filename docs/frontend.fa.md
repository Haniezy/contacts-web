# فاز ۵: زیرساخت فرانت، تم و زبان

Next.js App Router موجود حفظ شده و Tailwind با پلاگین PostCSS فعال است. رنگ‌های مشترک در `frontend/src/app/globals.css` هم به صورت CSS variable و هم utilityهای Tailwind مثل `text-ink` و `bg-mint` در دسترس‌اند.

فونت Vazirmatn با وزن‌های ۴۰۰، ۵۰۰ و ۷۰۰ از بسته محلی Fontsource ارائه می‌شود؛ مرورگر برای فونت به Google Fonts وصل نمی‌شود. فارسی و انگلیسی هر دو همین فونت را دارند.

## تم و زبان

- `next-themes` مقدار روشن/تاریک را در localStorage با کلید `contacts-theme` نگه می‌دارد و پیش از نمایش صفحه، `data-theme` را تنظیم می‌کند.
- پیش‌فرض فعلی تم روشن است؛ پیروی خودکار از تم سیستم فعال نیست. این انتخاب موقت تا تعیین ترجیح صاحب پروژه است.
- `next-intl` پیام‌ها را از `frontend/messages/fa.json` و `en.json` می‌خواند. زبان پیش‌فرض فارسی است.
- تغییر زبان با Server Action در کوکی `contacts-locale` با عمر یک سال، HttpOnly و SameSite=Lax ذخیره می‌شود. در HTTPS کوکی Secure است. فقط `fa` و `en` پذیرفته می‌شوند.
- سرور از همان کوکی، `lang` و `dir` روی HTML و عنوان صفحه را تولید می‌کند. مقدار کوکی نامعتبر به فارسی برمی‌گردد.
- برای نمایش اعداد در اجزای بعدی از `useFormatter().number(value)` در next-intl استفاده شود؛ زبان فارسی به‌صورت پیش‌فرض ارقام فارسی تولید می‌کند. داده مخاطبین و شماره مورد استفاده در تماس یا API تغییر نمی‌کند.
- اجزای `ThemeSwitch` و `LanguageSwitch` مستقل و قابل استفاده در هدر دسکتاپ و منوی موبایل هستند. از فاز ۷ در هدر دسکتاپ و منوی موبایل صفحه مخاطبین قرار دارند و در این دو جا نسخه جمع‌وجورتر طرح را دارند.

## رفتار تأییدشده سوییچ‌ها

دایره تم همیشه سفید است. در حالت روشن، خورشید در سمت راست قرار دارد؛ در حالت تاریک، ماه در سمت چپ. این جهت فیزیکی طبق درخواست کاربر در هر دو زبان ثابت است؛ بقیه چیدمان از جهت صفحه پیروی می‌کند. حرکت دایره ۲۰۰ میلی‌ثانیه است و در `prefers-reduced-motion: reduce` غیرفعال می‌شود. کنترل زبان دو دکمه فارسی/EN با حالت انتخاب‌شده و سایه است. کلیدهای Space/Enter قابل استفاده‌اند و کنترل‌ها برچسب دسترس‌پذیر و focus مشخص دارند.

مقادیر شفافیت، سایه و گرادیان صفحه که در سند طراحی عدد دقیق ندارند فعلاً مقادیر پایه‌اند و در تطبیق صفحه‌های نهایی بازبینی می‌شوند.

## بررسی

```bash
# از فاز ۶ برای تست مرورگر، DATABASE_TEST_URL باید در محیط تنظیم باشد.
npm --prefix backend run build
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
cd frontend
npx playwright install chromium
npm run test:e2e
```

تست مرورگر روی اندازه دسکتاپ و موبایل اجرا می‌شود: رفت‌وبرگشت تم و زبان، ماندگاری پس از رفرش، ترجمه، RTL/LTR، محل دایره، پاسخ سرور با کوکی، کوکی نامعتبر، بارگذاری فونت، نبود خطای hydration و کار با کیبورد و کاهش حرکت. سرور تست روی پورت ۳۱۰۰ اجرا می‌شود.

## منابع

- [تنظیم next-intl در App Router و دریافت زبان از کوکی](https://next-intl.dev/docs/getting-started/app-router)
- [next-themes و ملاحظات hydration](https://github.com/pacocoursey/next-themes)
- [تنظیم Tailwind با Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
