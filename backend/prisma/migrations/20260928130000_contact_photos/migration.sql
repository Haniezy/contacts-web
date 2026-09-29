BEGIN;
ALTER TABLE "Contact" ADD COLUMN "photoPublicId" TEXT;
-- ICU handles Persian and Latin alphabetic ordering consistently across hosts.
CREATE COLLATION "contacts_alphabetic" (provider = icu, locale = 'und-u-ks-level2', deterministic = true);
COMMIT;
