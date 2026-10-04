# استقرار روی Vercel و Neon

نسخه production روی **Vercel** اجرا می‌شود و داده‌اش روی **Neon** است.

| بخش                  | کجا                                                                 | نشانی                                     |
| -------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| سایت (فرانت Next.js) | پروژه Vercel `contacts-web`، پوشه `frontend`                        | https://contacts-web-rho.vercel.app       |
| API (بک‌اند Express) | پروژه Vercel `contacts-web-api`، پوشه `backend`                     | https://contacts-web-api-seven.vercel.app |
| دیتابیس              | Neon، پروژه `contacts-web`، branch `production`، دیتابیس `contacts` | —                                         |
| عکس‌ها               | Cloudinary (همان حساب نسخه محلی)                                    | —                                         |

- **Vercel:** کد را می‌سازد و روی اینترنت منتشر می‌کند. هر دو پروژه به مخزن GitHub `Haniezy/contacts-web` وصل‌اند؛ هر push به `main` نسخه production هر دو را دوباره می‌سازد. پوشه هر پروژه (Root Directory) در تنظیمات Vercel تعیین شده است. توابع در منطقه `fra1` (فرانکفورت) اجرا می‌شوند تا نزدیک دیتابیس باشند.
- **Neon:** PostgreSQL ابری. branch `production` جدا از branch `main` است که توسعه محلی و تست‌ها از آن استفاده می‌کنند؛ تست‌ها هیچ‌وقت به داده production دست نمی‌زنند.

## بک‌اند روی Vercel

- `backend/api/index.js` برنامه Express ساخته‌شده (`dist/app.js`) را به‌عنوان یک Vercel Function صادر می‌کند و `backend/vercel.json` همه مسیرها را به آن می‌فرستد. Vercel پیش از آن `npm run build` (Prisma generate و TypeScript) را اجرا می‌کند.
- `backend/public` فقط `robots.txt` دارد؛ Vercel برای پروژه بدون فریم‌ورک یک پوشه خروجی می‌خواهد.
- **سقف عکس ۴ مگابایت:** بدنه درخواست در Vercel حداکثر ۴٫۵ مگابایت است، پس سقف عکس در فرانت، واسط فرانت و API از ۵ به ۴ مگابایت رسید. عکس پس از آپلود کوچک و فشرده می‌شود.
- **محدودیت تعداد تلاش‌ها:** درخواست‌ها از سرور فرانت به API می‌رسند. واسط فرانت نشانی واقعی کاربر را (که Vercel در `X-Real-IP` می‌گذارد) با کلید مشترک `INTERNAL_API_KEY` در `X-Client-IP` می‌فرستد و API فقط با همان کلید آن را باور می‌کند (`backend/src/auth/client-ip.ts`). درخواست مستقیم به API روی Vercel با `X-Real-IP` خود Vercel شناخته می‌شود. محلی و بدون این کلید رفتار مثل قبل است.
  - شمارنده‌ها هنوز در حافظه هر نمونه تابع‌اند؛ اگر Vercel چند نمونه همزمان اجرا کند، هر کدام جدا می‌شمارد. شمارش تلاش کد دومرحله‌ای در دیتابیس است و به این وابسته نیست.

## متغیرهای محیطی production

در Vercel فقط برای محیط Production تعریف شده‌اند و هیچ‌کدام در مخزن نیستند.

| پروژه | متغیر                                     | توضیح                                       |
| ----- | ----------------------------------------- | ------------------------------------------- |
| API   | `DATABASE_URL`                            | اتصال pooled به branch `production` در Neon |
| API   | `JWT_SECRET`، `TWO_FACTOR_ENCRYPTION_KEY` | کلیدهای تازه و جدا از نسخه محلی             |
| API   | `APP_ORIGIN`                              | `https://contacts-web-rho.vercel.app`       |
| API   | `AUTH_COOKIE_SECURE`                      | `true`                                      |
| API   | `CLOUDINARY_*`                            | کلیدهای Cloudinary                          |
| هر دو | `INTERNAL_API_KEY`                        | کلید مشترک فرانت و API برای نشانی کاربر     |
| سایت  | `BACKEND_INTERNAL_URL`                    | `https://contacts-web-api-seven.vercel.app` |
| سایت  | `APP_ORIGIN`                              | `https://contacts-web-rho.vercel.app`       |

`TWO_FACTOR_ENCRYPTION_KEY` نباید عوض یا گم شود؛ با تغییر آن رمز 2FA همه کاربران production خوانده نمی‌شود. با `vercel env pull` می‌توان نسخه‌ای از آن برداشت و جای امن نگه داشت.

## مایگریشن دیتابیس

Vercel مایگریشن اجرا نمی‌کند. پس از اضافه شدن مایگریشن جدید، پیش از push آن را روی production اجرا کنید (آدرس مستقیم، بدون `-pooler`، از Neon):

```bash
cd backend
DIRECT_URL="<آدرس مستقیم branch production>" npx prisma migrate deploy
```

## انتشار دستی

با Vercel CLI (پس از `vercel login` و `vercel link --repo` در ریشه مخزن):

```bash
cd frontend
npx vercel deploy --prod
```

برای API همین کار را در پوشه `backend` انجام دهید.
