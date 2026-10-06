-- Signed-in devices in Settings: which browser a session is, and when it
-- was last used. Both stay empty until the session's next request.
ALTER TABLE "AuthSession" ADD COLUMN "userAgent" VARCHAR(512);
ALTER TABLE "AuthSession" ADD COLUMN "lastSeenAt" TIMESTAMPTZ(3);
