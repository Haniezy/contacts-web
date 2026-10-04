BEGIN;

-- Ignored groups can now be name groups as well as phone groups.
ALTER TABLE "DuplicateIgnore" DROP CONSTRAINT "DuplicateIgnore_pkey";
ALTER TABLE "DuplicateIgnore" RENAME COLUMN "phone" TO "value";
ALTER TABLE "DuplicateIgnore" ALTER COLUMN "value" TYPE VARCHAR(200);
ALTER TABLE "DuplicateIgnore" ADD COLUMN "by" VARCHAR(5) NOT NULL DEFAULT 'phone';
ALTER TABLE "DuplicateIgnore" ALTER COLUMN "by" DROP DEFAULT;
ALTER TABLE "DuplicateIgnore" ADD CONSTRAINT "DuplicateIgnore_pkey" PRIMARY KEY ("userId", "by", "value");

COMMIT;
