import { sortKey } from '@genealogie/shared';
import { normalizeForSearch } from '../common/normalize.js';
import type { Prisma } from '../generated/prisma/client.js';
import { baseName, mediaKey } from '../gedcom/media.js';
import type { EventRecord, GenealogyData, MediaRecord } from '../gedcom/model.js';

const CHUNK_SIZE = 500;

function chunks<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    result.push(items.slice(i, i + CHUNK_SIZE));
  }
  return result;
}

function eventData(
  event: EventRecord,
  owner: { personId: string } | { familyId: string },
  placeIds: Map<string, number>,
): Prisma.EventCreateManyInput {
  const date = event.date;
  return {
    ...owner,
    type: event.type,
    value: event.value ?? null,
    dateOriginal: date?.date.original ?? null,
    dateQualifier: date?.date.qualifier ?? null,
    dateCalendar: date?.date.calendar ?? null,
    dateYear: date?.date.start?.year ?? null,
    dateMonth: date?.date.start?.month ?? null,
    dateDay: date?.date.start?.day ?? null,
    dateEndYear: date?.date.end?.year ?? null,
    dateEndMonth: date?.date.end?.month ?? null,
    dateEndDay: date?.date.end?.day ?? null,
    dateSortKey: date?.sortKey ?? null,
    dateEndSortKey: date?.gregorianEnd ? sortKey(date.gregorianEnd) : null,
    placeId: event.place ? (placeIds.get(event.place) ?? null) : null,
  };
}

/**
 * Replaces all genealogy data with that of the imported file. Must be called
 * within a transaction.
 */
export async function replaceGenealogy(
  tx: Prisma.TransactionClient,
  data: GenealogyData,
  /** Hash of the stored file of each provided document, by key (see mediaKey). */
  files: ReadonlyMap<string, string> = new Map(),
): Promise<void> {
  await tx.media.deleteMany();
  await tx.event.deleteMany();
  await tx.familyChild.deleteMany();
  await tx.family.deleteMany();
  await tx.person.deleteMany();
  await tx.place.deleteMany();

  for (const chunk of chunks([...data.places.values()])) {
    await tx.place.createMany({
      data: chunk.map((place) => ({
        fullName: place.fullName,
        locality: place.locality ?? null,
        postalCode: place.postalCode ?? null,
        county: place.county ?? null,
        region: place.region ?? null,
        country: place.country ?? null,
        latitude: place.latitude ?? null,
        longitude: place.longitude ?? null,
        searchName: normalizeForSearch(place.fullName),
      })),
    });
  }
  const placeIds = new Map(
    (await tx.place.findMany({ select: { id: true, fullName: true } })).map((place) => [place.fullName, place.id]),
  );

  for (const chunk of chunks(data.persons)) {
    await tx.person.createMany({
      data: chunk.map((person) => {
        const birth = data.birthKeys.get(person.id);
        return {
          id: person.id,
          givenNames: person.givenNames,
          surname: person.surname,
          sex: person.sex,
          occupation: person.occupation ?? null,
          note: person.note ?? null,
          searchName: normalizeForSearch(`${person.givenNames} ${person.surname}`),
          sortName: `${normalizeForSearch(person.surname)}|${normalizeForSearch(person.givenNames)}`,
          birthKey: birth?.key ?? null,
          birthKeyEstimated: birth?.estimated ?? false,
        };
      }),
    });
  }

  for (const chunk of chunks(data.families)) {
    await tx.family.createMany({
      data: chunk.map((family) => ({
        id: family.id,
        partner1Id: family.partner1Id ?? null,
        partner2Id: family.partner2Id ?? null,
      })),
    });
  }

  const pedigrees = new Map(
    data.persons.flatMap((person) =>
      person.parentFamilies.map(({ familyId, pedigree }) => [`${familyId}/${person.id}`, pedigree] as const),
    ),
  );
  const familyChildren = data.families.flatMap((family) =>
    family.childIds.map((childId, position) => ({
      familyId: family.id,
      childId,
      position,
      pedigree: pedigrees.get(`${family.id}/${childId}`) ?? null,
    })),
  );
  for (const chunk of chunks(familyChildren)) {
    await tx.familyChild.createMany({ data: chunk });
  }

  const events = [
    ...data.persons.flatMap((person) => person.events.map((e) => eventData(e, { personId: person.id }, placeIds))),
    ...data.families.flatMap((family) => family.events.map((e) => eventData(e, { familyId: family.id }, placeIds))),
  ];
  for (const chunk of chunks(events)) {
    await tx.event.createMany({ data: chunk });
  }

  const media = [
    ...data.persons.flatMap((person) =>
      person.media.map((m, position) => mediaData(m, position, { personId: person.id }, files)),
    ),
    ...data.families.flatMap((family) =>
      family.media.map((m, position) => mediaData(m, position, { familyId: family.id }, files)),
    ),
  ];
  for (const chunk of chunks(media)) {
    await tx.media.createMany({ data: chunk });
  }
}

function mediaData(
  media: MediaRecord,
  position: number,
  owner: { personId: string } | { familyId: string },
  files: ReadonlyMap<string, string>,
): Prisma.MediaCreateManyInput {
  return {
    ...owner,
    eventType: media.eventType ?? null,
    title: media.title ?? null,
    fileName: baseName(media.file),
    hash: files.get(mediaKey(media.file)) ?? null,
    position,
  };
}
