-- CreateTable
CREATE TABLE "Contribution" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "personId" TEXT NOT NULL,
    "personGivenNames" TEXT NOT NULL,
    "personSurname" TEXT NOT NULL,
    "relation" TEXT,
    "familyId" TEXT,
    "fields" TEXT NOT NULL DEFAULT '{}',
    "previous" TEXT,
    "comment" TEXT,
    "fileName" TEXT,
    "title" TEXT,
    "hash" TEXT,
    "authorId" INTEGER,
    "reviewerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "exportedAt" DATETIME,
    "integratedAt" DATETIME,
    "integratedPersonId" TEXT,
    CONSTRAINT "Contribution_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contribution_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contribution_hash_fkey" FOREIGN KEY ("hash") REFERENCES "MediaFile" ("hash") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Contribution_status_idx" ON "Contribution"("status");

-- CreateIndex
CREATE INDEX "Contribution_authorId_idx" ON "Contribution"("authorId");
