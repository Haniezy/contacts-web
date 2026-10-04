# استقرار روی Vercel و Neon

نسخه production روی **Vercel** اجرا می‌شود و داده‌اش روی **Neon** است.

| بخش        | کجا                                                                 | نشانی                               |
| ---------- | ------------------------------------------------------------------- | ----------------------------------- |
| سایت و API | پروژه Vercel `contacts-web` (ریشه مخزن)                             | https://contacts-web-rho.vercel.app |
| دیتابیس    | Neon، پروژه `contacts-web`، branch `production`، دیتابیس `contacts` | —                                   |
| عکس‌ها     | Cloudinary (همان حساب نسخه محلی)                                    | —                                   |

- **Vercel:** کد را می‌سازد و روی اینترنت منتشر می‌کند. پروژه به مخزن GitHub `Haniezy/contacts-web` وصل است؛ هر push به `main` نسخه production را دوباره می‌سازد (`npm run build`: Prisma generate و build Next.js). توابع در منطقه `fra1` (فرانکفورت) اجرا می‌شوند تا نزدیک دیتابیس باشند (`vercel.json`).
- **Neon:** PostgreSQL ابری. branch `production` جدا از branch `main` است که توسعه محلی و تست‌ها از آن استفاده می‌کنند؛ تست‌ها هیچ‌وقت به داده production دست نمی‌زنند.
- **یک پروژه:** صفحه‌ها و API در یک برنامه Next.js‌اند؛ API در `src/app/api/[...path]/route.ts` و `src/server` اجرا می‌شود. سرویس، آدرس یا کلید جدایی برای API وجود ندارد.

## نکته‌های اجرا روی Vercel

- **سقف عکس ۴ مگابایت:** بدنه درخواست در Vercel حداکثر ۴٫۵ مگابایت است، پس سقف عکس در فرانت و API ۴ مگابایت است. عکس پس از آپلود کوچک و فشرده می‌شود.
- **محدودیت تعداد تلاش‌ها:** هر کاربر با نشانی‌ای که Vercel در `X-Real-IP` می‌گذارد جدا شمرده می‌شود (`src/server/auth/client-ip.ts`). شمارنده‌ها در حافظه هر نمونه تابع‌اند؛ اگر Vercel چند نمونه همزمان اجرا کند، هر کدام جدا می‌شمارد. شمارش تلاش کد دومرحله‌ای در دیتابیس است و به این وابسته نیست.
- **ماژول‌های native:** `argon2` و `sharp` در `serverExternalPackages` (`next.config.ts`) هستند تا Next.js آن‌ها را bundle نکند.

## متغیرهای محیطی production

در Vercel فقط برای محیط Production تعریف شده‌اند و هیچ‌کدام در مخزن نیستند.

| متغیر                                     | توضیح                                       |
| ----------------------------------------- | ------------------------------------------- |
| `DATABASE_URL`                            | اتصال pooled به branch `production` در Neon |
| `JWT_SECRET`، `TWO_FACTOR_ENCRYPTION_KEY` | کلیدهای جدا از نسخه محلی                    |
| `APP_ORIGIN`                              | `https://contacts-web-rho.vercel.app`       |
| `AUTH_COOKIE_SECURE`                      | `true`                                      |
| `CLOUDINARY_*`                            | کلیدهای Cloudinary                          |

`TWO_FACTOR_ENCRYPTION_KEY` نباید عوض یا گم شود؛ با تغییر آن رمز 2FA همه کاربران production خوانده نمی‌شود. با `vercel env pull` می‌توان نسخه‌ای از آن برداشت و جای امن نگه داشت.

## مایگریشن دیتابیس

Vercel مایگریشن اجرا نمی‌کند. پس از اضافه شدن مایگریشن جدید، پیش از push آن را روی production اجرا کنید (آدرس مستقیم، بدون `-pooler`، از Neon):

```bash
DIRECT_URL="<آدرس مستقیم branch production>" npx prisma migrate deploy
```

## انتشار دستی

با Vercel CLI از ریشه مخزن (پس از `vercel login` و `vercel link`):

```bash
npx vercel deploy --prod
```
