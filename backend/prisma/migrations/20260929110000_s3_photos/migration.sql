BEGIN;
-- Never reinterpret an existing Cloudinary asset ID as an S3 key.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Contact" WHERE "photoPublicId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Migrate existing Cloudinary photos before applying the S3 migration';
  END IF;
END $$;
ALTER TABLE "Contact" RENAME COLUMN "photoPublicId" TO "photoKey";
COMMIT;
