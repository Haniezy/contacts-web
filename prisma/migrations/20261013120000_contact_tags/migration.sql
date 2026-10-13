-- Tags: the user's own labels (with one of the app's colours), any number
-- per contact. The default ones are made on first use (tagsSeeded).
ALTER TABLE "User" ADD COLUMN "tagsSeeded" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(24) NOT NULL,
    "color" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactTag" (
    "contactId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId","tagId")
);

CREATE INDEX "Tag_userId_createdAt_idx" ON "Tag"("userId", "createdAt");

CREATE INDEX "ContactTag_tagId_idx" ON "ContactTag"("tagId");

ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
