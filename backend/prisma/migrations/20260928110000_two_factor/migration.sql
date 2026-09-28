BEGIN;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorLastStep" INTEGER,
ADD COLUMN     "twoFactorSetupAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "twoFactorSetupExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "twoFactorSetupSessionId" UUID;

-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN     "twoFactorVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LoginChallenge" (
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "LoginChallenge_userId_idx" ON "LoginChallenge"("userId");

-- CreateIndex
CREATE INDEX "LoginChallenge_expiresAt_idx" ON "LoginChallenge"("expiresAt");

-- AddForeignKey
ALTER TABLE "LoginChallenge" ADD CONSTRAINT "LoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
