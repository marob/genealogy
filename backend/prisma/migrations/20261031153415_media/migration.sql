-- CreateTable
CREATE TABLE "Media" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "personId" TEXT,
    "familyId" TEXT,
    "eventType" TEXT,
    "title" TEXT,
    "fileName" TEXT NOT NULL,
    "hash" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Media_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Media_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Media_hash_fkey" FOREIGN KEY ("hash") REFERENCES "MediaFile" ("hash") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "hash" TEXT NOT NULL PRIMARY KEY,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "importId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    PRIMARY KEY ("importId", "key"),
    CONSTRAINT "ImportFile_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportFile_hash_fkey" FOREIGN KEY ("hash") REFERENCES "MediaFile" ("hash") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Media_personId_idx" ON "Media"("personId");

-- CreateIndex
CREATE INDEX "Media_familyId_idx" ON "Media"("familyId");

-- CreateIndex
CREATE INDEX "Media_hash_idx" ON "Media"("hash");

-- CreateIndex
CREATE INDEX "ImportFile_hash_idx" ON "ImportFile"("hash");
