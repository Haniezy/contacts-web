# راه‌اندازی S3 برای عکس مخاطبین

S3 فضای نگه‌داری فایل در AWS است. «bucket» ظرفی است که فایل‌های پروژه داخل آن قرار می‌گیرند؛ نام bucket و region مشخص می‌کنند بک‌اند فایل را کجا ذخیره کند. Access key و Secret key به بک‌اند اجازه کار با همان فایل‌ها را می‌دهند. این موارد با ایمیل، پسورد سایت یا تنظیمات Neon فرق دارند.

## ۱. ساخت حساب

از [وب‌سایت AWS](https://aws.amazon.com/) گزینه Create account را انتخاب کنید و مراحل تأیید ایمیل، اطلاعات تماس، روش پرداخت و تأیید هویت/شماره را طبق فرم حساب انجام دهید. دسترسی، طرح‌ها و امکان ثبت‌نام به شرایط حساب بستگی دارند؛ رایگان‌بودن دائمی سرویس یا پذیرفته‌شدن روش پرداخت تضمین نیست. اگر روش پرداخت قابل قبول ندارید یا ثبت‌نام ممکن نیست، فعلاً همین‌جا متوقف شوید؛ پیاده‌سازی و تست پروژه به پرداخت یا حساب واقعی نیاز ندارند.

راهنمای رسمی: [ساخت حساب AWS](https://docs.aws.amazon.com/accounts/latest/reference/getting-started.html). برای حساب اصلی MFA فعال کنید؛ کلید root را در برنامه قرار ندهید. این پروژه تا تنظیم حساب شما به AWS واقعی وصل نشده است.

## ۲. ساخت bucket خصوصی

در کنسول AWS وارد S3 شوید و Create bucket را بزنید:

- نوع bucket: General purpose.
- Region: منطقه‌ای که انتخاب می‌کنید؛ مثلاً `eu-central-1`. همان مقدار باید در `.env` باشد.
- نام: یک نام یکتای در دسترس، مثلاً `contacts-photos-<شناسه-یکتای-شما>`؛ این فقط مثال است.
- Object Ownership: Bucket owner enforced؛ ACLs disabled.
- Block all public access: **روشن** بماند.
- Default encryption: SSE-S3.
- برای شروع، Versioning غیرفعال بماند. با Versioning فعال، حذف عادی فقط delete marker می‌سازد و نسخه قبلی می‌ماند؛ برای پاک‌سازی و هزینه نسخه‌ها باید Lifecycle جداگانه تنظیم شود.

bucket نباید policy عمومی یا static website hosting داشته باشد. برای نمایش عادی با `<img>` به CORS عمومی bucket نیاز نیست؛ آپلود از بک‌اند انجام می‌شود. [مستندات دسترسی خصوصی S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/configuring-block-public-access-bucket.html)

## ۳. دسترسی محدود بک‌اند

برای توسعه محلی، در IAM یک کاربر مخصوص برنامه با نامی مانند `contacts-backend` بسازید؛ ورود به کنسول لازم نیست. policy زیر را به همان کاربر بدهید و `YOUR_BUCKET_NAME` را با نام واقعی bucket جایگزین کنید. دسترسی AdministratorAccess یا AmazonS3FullAccess لازم نیست:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/contacts/*"
    }
  ]
}
```

برای این کاربر از Security credentials → Access keys یک کلید مناسب اجرای محلی بسازید. Secret فقط هنگام ساخت قابل مشاهده است؛ آن را مستقیم در `.env` پروژه قرار دهید و در چت، Git یا فرانت نفرستید. در استقرار روی AWS، IAM Role با همین سطح دسترسی را به سرویس اختصاص دهید و از کلید ثابت استفاده نکنید.

## ۴. تنظیم پروژه

فایل `.env` موجود را باز کنید؛ آن را با `.env.example` جایگزین نکنید چون تنظیمات Neon و Auth داخل آن است. این موارد را اضافه کنید:

```dotenv
AWS_REGION=eu-central-1
S3_BUCKET=YOUR_BUCKET_NAME
AWS_ACCESS_KEY_ID=کلید-دسترسی-خودتان
AWS_SECRET_ACCESS_KEY=کلید-محرمانه-خودتان
```

برای credential موقت، `AWS_SESSION_TOKEN` نیز لازم است. سپس:

```bash
docker compose up -d backend
```

## ۵. بررسی عملی

با حساب واردشده یک مخاطب بسازید و یک JPEG/PNG/WebP کمتر از ۵ MiB به `POST /api/contacts/:id/photo` بفرستید. قرارداد دقیق multipart در [راهنمای API](contacts.fa.md) است. پاسخ باید `photoUrl` امضاشده داشته باشد و `photoKey` را به‌عنوان فیلد برنگرداند. نمایش لینک امضاشده باید کار کند و لینک بدون پارامترهای امضا نباید دسترسی عمومی بدهد. با حذف عکس، همان فایل S3 باید حذف شود.

هزینه به حجم نگه‌داری، درخواست‌ها و انتقال داده بستگی دارد. قبل از استفاده عمومی، هزینه و هشدار بودجه را در حساب خود بررسی کنید؛ هشدار بودجه به معنی قطع خودکار هزینه نیست.
