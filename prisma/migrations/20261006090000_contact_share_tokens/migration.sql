-- Public share links: every contact gets a random 32-character code. The
-- default is volatile, so existing rows each get their own code.
ALTER TABLE "Contact" ADD COLUMN "shareToken" VARCHAR(32) NOT NULL DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text);

CREATE UNIQUE INDEX "Contact_shareToken_key" ON "Contact"("shareToken");
