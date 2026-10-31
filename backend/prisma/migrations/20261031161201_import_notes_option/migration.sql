-- Option to leave the notes of the GEDCOM file out of the tree.
ALTER TABLE "ImportRun" ADD COLUMN "importNotes" BOOLEAN NOT NULL DEFAULT true;
