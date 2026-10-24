-- Gregorian key of the second bound of a date (between, from-to), for the privacy rule.
ALTER TABLE "Event" ADD COLUMN "dateEndSortKey" INTEGER;
