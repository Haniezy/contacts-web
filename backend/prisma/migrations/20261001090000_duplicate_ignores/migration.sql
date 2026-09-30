BEGIN;

-- CreateTable
CREATE TABLE "DuplicateIgnore" (
    "userId" UUID NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "contactIds" UUID[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateIgnore_pkey" PRIMARY KEY ("userId","phone")
);

-- AddForeignKey
ALTER TABLE "DuplicateIgnore" ADD CONSTRAINT "DuplicateIgnore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
