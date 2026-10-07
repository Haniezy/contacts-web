-- The trash: a deleted contact keeps its row with deletedAt set for a week.
ALTER TABLE "Contact" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

CREATE INDEX "Contact_userId_deletedAt_idx" ON "Contact"("userId", "deletedAt");
