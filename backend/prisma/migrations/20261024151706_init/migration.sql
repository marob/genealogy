-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "givenNames" TEXT NOT NULL DEFAULT '',
    "surname" TEXT NOT NULL DEFAULT '',
    "sex" TEXT NOT NULL DEFAULT 'U',
    "occupation" TEXT,
    "note" TEXT,
    "searchName" TEXT NOT NULL DEFAULT '',
    "sortName" TEXT NOT NULL DEFAULT '',
    "birthKey" INTEGER,
    "birthKeyEstimated" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partner1Id" TEXT,
    "partner2Id" TEXT,
    CONSTRAINT "Family_partner1Id_fkey" FOREIGN KEY ("partner1Id") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Family_partner2Id_fkey" FOREIGN KEY ("partner2Id") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FamilyChild" (
    "familyId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "pedigree" TEXT,

    PRIMARY KEY ("familyId", "childId"),
    CONSTRAINT "FamilyChild_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FamilyChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "personId" TEXT,
    "familyId" TEXT,
    "value" TEXT,
    "dateOriginal" TEXT,
    "dateQualifier" TEXT,
    "dateCalendar" TEXT,
    "dateYear" INTEGER,
    "dateMonth" INTEGER,
    "dateDay" INTEGER,
    "dateEndYear" INTEGER,
    "dateEndMonth" INTEGER,
    "dateEndDay" INTEGER,
    "dateSortKey" INTEGER,
    "placeId" INTEGER,
    CONSTRAINT "Event_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Place" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fullName" TEXT NOT NULL,
    "locality" TEXT,
    "postalCode" TEXT,
    "county" TEXT,
    "region" TEXT,
    "country" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "searchName" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" DATETIME,
    "status" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "encoding" TEXT NOT NULL,
    "gedcomVersion" TEXT,
    "sourceSoftware" TEXT,
    "stats" TEXT NOT NULL DEFAULT '{}',
    "warnings" TEXT NOT NULL DEFAULT '[]',
    "content" BLOB NOT NULL,
    "userId" INTEGER,
    CONSTRAINT "ImportRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "canSeeContemporary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME
);

-- CreateTable
CREATE TABLE "Identity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "Identity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Person_searchName_idx" ON "Person"("searchName");

-- CreateIndex
CREATE INDEX "Person_sortName_idx" ON "Person"("sortName");

-- CreateIndex
CREATE INDEX "Person_surname_idx" ON "Person"("surname");

-- CreateIndex
CREATE INDEX "Person_birthKey_idx" ON "Person"("birthKey");

-- CreateIndex
CREATE INDEX "Family_partner1Id_idx" ON "Family"("partner1Id");

-- CreateIndex
CREATE INDEX "Family_partner2Id_idx" ON "Family"("partner2Id");

-- CreateIndex
CREATE INDEX "FamilyChild_childId_idx" ON "FamilyChild"("childId");

-- CreateIndex
CREATE INDEX "Event_personId_idx" ON "Event"("personId");

-- CreateIndex
CREATE INDEX "Event_familyId_idx" ON "Event"("familyId");

-- CreateIndex
CREATE INDEX "Event_type_dateSortKey_idx" ON "Event"("type", "dateSortKey");

-- CreateIndex
CREATE INDEX "Event_placeId_idx" ON "Event"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "Place_fullName_key" ON "Place"("fullName");

-- CreateIndex
CREATE INDEX "Place_searchName_idx" ON "Place"("searchName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_provider_subject_key" ON "Identity"("provider", "subject");
