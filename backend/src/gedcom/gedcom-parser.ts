import type { Sex } from '@genealogie/shared';
import { estimateBirthKeys } from './birth-estimation.js';
import { parseGedcomDate } from './dates.js';
import { type DecodedGedcom, decodeGedcom } from './encoding.js';
import { child, childValue, children, type GedcomNode, parseLines, pointer } from './lines.js';
import type { EventRecord, FamilyRecord, GenealogyData, PersonRecord } from './model.js';
import { type ParsedPlace, parsePlace, parsePlaceForm } from './places.js';

/**
 * GEDCOM parsing entry point: raw bytes → genealogy model.
 */

const PERSON_EVENT_TAGS = new Set([
  'BIRT',
  'CHR',
  'BAPM',
  'BLES',
  'CONF',
  'FCOM',
  'BARM',
  'BASM',
  'ADOP',
  'ORDN',
  'DEAT',
  'BURI',
  'CREM',
  'PROB',
  'WILL',
  'OCCU',
  'RESI',
  'EDUC',
  'GRAD',
  'RETI',
  'RELI',
  'TITL',
  'NATI',
  'NATU',
  'EMIG',
  'IMMI',
  'CENS',
  'EVEN',
  'FACT',
  '_MILT',
  '_MILI',
]);
const FAMILY_EVENT_TAGS = new Set([
  'MARR',
  'MARB',
  'MARC',
  'MARL',
  'MARS',
  'ENGA',
  'DIV',
  'DIVF',
  'ANUL',
  'CENS',
  'EVEN',
  'RESI',
]);
/** Tags deliberately not imported for now (no individual warning). */
const PERSON_HANDLED_TAGS = new Set(['NAME', 'SEX', 'FAMC', 'FAMS', 'NOTE', 'CHAN', 'RIN', 'UID', '_UID', 'REFN']);
const FAMILY_HANDLED_TAGS = new Set(['HUSB', 'WIFE', 'CHIL', 'NOTE', 'CHAN', 'RIN', 'UID', '_UID', 'REFN', 'NCHI']);

interface Context {
  notes: Map<string, string>;
  placeForm: ReturnType<typeof parsePlaceForm>;
  places: Map<string, ParsedPlace>;
  warnings: string[];
  ignoredTags: Record<string, number>;
}

function countIgnored(ctx: Context, tag: string): void {
  ctx.ignoredTags[tag] = (ctx.ignoredTags[tag] ?? 0) + 1;
}

function readNotes(node: GedcomNode, ctx: Context): string | undefined {
  const notes = children(node, 'NOTE')
    .map((note) => {
      const ref = pointer(note.value);
      return (ref ? ctx.notes.get(ref) : note.value)?.trim();
    })
    .filter((note): note is string => !!note);
  return notes.length ? notes.join('\n\n') : undefined;
}

function readEvent(node: GedcomNode, ctx: Context): EventRecord {
  const typeDetail = childValue(node, 'TYPE');
  const event: EventRecord = { type: node.tag };
  const value = [node.value.trim() === 'Y' ? '' : node.value.trim(), typeDetail].filter(Boolean).join(' – ');
  if (value) {
    event.value = value;
  }
  const date = parseGedcomDate(childValue(node, 'DATE'));
  if (date) {
    event.date = date;
    if (date.date.qualifier === 'phrase' && date.date.original && !/^\(.*\)$/.test(date.date.original)) {
      ctx.warnings.push(`Unrecognized date kept as is (line ${child(node, 'DATE')!.line}): "${date.date.original}"`);
    }
  }
  const placeNode = child(node, 'PLAC');
  if (placeNode) {
    const map = child(placeNode, 'MAP');
    const place = parsePlace(placeNode.value, ctx.placeForm, {
      latitude: childValue(map, 'LATI'),
      longitude: childValue(map, 'LONG'),
    });
    if (place) {
      const existing = ctx.places.get(place.fullName);
      if (!existing || (existing.latitude === undefined && place.latitude !== undefined)) {
        ctx.places.set(place.fullName, place);
      }
      event.place = place.fullName;
    }
  }
  return event;
}

function readName(node: GedcomNode): { givenNames: string; surname: string } {
  const nameNode = child(node, 'NAME');
  const raw = nameNode?.value ?? '';
  const match = /^([^/]*)\/([^/]*)\/?(.*)$/.exec(raw);
  const givenFromValue = match ? `${match[1]!} ${match[3]!}` : raw;
  const surnameFromValue = match ? match[2]! : '';
  const clean = (text: string): string => text.replace(/\s+/g, ' ').trim();
  return {
    givenNames: clean(childValue(nameNode, 'GIVN') ?? givenFromValue),
    surname: clean(childValue(nameNode, 'SURN') ?? surnameFromValue),
  };
}

function readSex(value: string | undefined): Sex {
  const sex = value?.toUpperCase();
  return sex === 'M' || sex === 'F' ? sex : 'U';
}

function readPerson(node: GedcomNode, ctx: Context): PersonRecord {
  const person: PersonRecord = {
    id: node.xref!,
    ...readName(node),
    sex: readSex(childValue(node, 'SEX')),
    events: [],
    parentFamilies: children(node, 'FAMC')
      .map((famc) => ({ familyId: pointer(famc.value), pedigree: childValue(famc, 'PEDI')?.toLowerCase() }))
      .filter((famc): famc is { familyId: string; pedigree: string | undefined } => !!famc.familyId)
      .map(({ familyId, pedigree }) => (pedigree ? { familyId, pedigree } : { familyId })),
  };
  const note = readNotes(node, ctx);
  if (note) {
    person.note = note;
  }
  for (const sub of node.children) {
    if (PERSON_EVENT_TAGS.has(sub.tag)) {
      person.events.push(readEvent(sub, ctx));
    } else if (!PERSON_HANDLED_TAGS.has(sub.tag)) {
      countIgnored(ctx, `INDI.${sub.tag}`);
    }
  }
  const occupations = person.events.filter((e) => e.type === 'OCCU' && e.value).map((e) => e.value!);
  if (occupations.length) {
    person.occupation = [...new Set(occupations)].join(', ');
  }
  return person;
}

function readFamily(node: GedcomNode, ctx: Context): FamilyRecord {
  const family: FamilyRecord = {
    id: node.xref!,
    childIds: children(node, 'CHIL')
      .map((chil) => pointer(chil.value))
      .filter((id): id is string => !!id),
    events: [],
  };
  const partner1Id = pointer(childValue(node, 'HUSB'));
  const partner2Id = pointer(childValue(node, 'WIFE'));
  if (partner1Id) {
    family.partner1Id = partner1Id;
  }
  if (partner2Id) {
    family.partner2Id = partner2Id;
  }
  for (const sub of node.children) {
    if (FAMILY_EVENT_TAGS.has(sub.tag)) {
      family.events.push(readEvent(sub, ctx));
    } else if (!FAMILY_HANDLED_TAGS.has(sub.tag)) {
      countIgnored(ctx, `FAM.${sub.tag}`);
    }
  }
  return family;
}

/** Checks cross-references and fills in missing links. */
function linkRecords(persons: PersonRecord[], families: FamilyRecord[], warnings: string[]): void {
  const personById = new Map(persons.map((p) => [p.id, p]));
  const familyIds = new Set(families.map((f) => f.id));

  for (const family of families) {
    const missingPartner = (id: string | undefined): boolean => {
      if (id && !personById.has(id)) {
        warnings.push(`Family ${family.id} references a nonexistent person (${id}).`);
        return true;
      }
      return false;
    };
    if (missingPartner(family.partner1Id)) {
      delete family.partner1Id;
    }
    if (missingPartner(family.partner2Id)) {
      delete family.partner2Id;
    }
    family.childIds = family.childIds.filter((childId) => {
      const person = personById.get(childId);
      if (!person) {
        warnings.push(`Family ${family.id} references a nonexistent child (${childId}).`);
        return false;
      }
      if (childId === family.partner1Id || childId === family.partner2Id) {
        warnings.push(
          `Person ${childId} is both a parent and a child in family ${family.id}: parent-child link ignored.`,
        );
        person.parentFamilies = person.parentFamilies.filter((famc) => famc.familyId !== family.id);
        return false;
      }
      // Link declared only on the family side: add it on the person side.
      if (!person.parentFamilies.some((famc) => famc.familyId === family.id)) {
        person.parentFamilies.push({ familyId: family.id });
      }
      return true;
    });
  }

  for (const person of persons) {
    person.parentFamilies = person.parentFamilies.filter(({ familyId }) => {
      if (!familyIds.has(familyId)) {
        warnings.push(`Person ${person.id} references a nonexistent family (${familyId}).`);
        return false;
      }
      return true;
    });
  }
  // Link declared only on the person side: add it to the family's children.
  const familyById = new Map(families.map((f) => [f.id, f]));
  for (const person of persons) {
    for (const { familyId } of person.parentFamilies) {
      const family = familyById.get(familyId)!;
      if (!family.childIds.includes(person.id)) {
        family.childIds.push(person.id);
      }
    }
  }
}

function dedupe<T extends { id: string }>(records: T[], kind: string, warnings: string[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) {
      warnings.push(`${kind} ${record.id} defined more than once: only the first occurrence is imported.`);
      return false;
    }
    seen.add(record.id);
    return true;
  });
}

export interface ParseResult extends GenealogyData {
  decoded: Omit<DecodedGedcom, 'text'>;
}

export function parseGedcom(bytes: Uint8Array): ParseResult {
  const decoded = decodeGedcom(bytes);
  const { records, warnings: lineWarnings } = parseLines(decoded.text);
  const warnings = [...decoded.warnings, ...lineWarnings];

  const head = records.find((r) => r.tag === 'HEAD');
  if (!head) {
    warnings.push('Missing HEAD header: the file may not be a GEDCOM.');
  }
  const ctx: Context = {
    notes: new Map(records.filter((r) => r.tag === 'NOTE' && r.xref).map((r) => [r.xref!, r.value])),
    placeForm: parsePlaceForm(childValue(child(head, 'PLAC'), 'FORM')),
    places: new Map(),
    warnings,
    ignoredTags: {},
  };

  const withXref = (tag: string): GedcomNode[] =>
    records.filter((r) => {
      if (r.tag !== tag) {
        return false;
      }
      if (!r.xref) {
        warnings.push(`${tag} record without an identifier ignored (line ${r.line}).`);
        return false;
      }
      return true;
    });

  const persons = dedupe(
    withXref('INDI').map((r) => readPerson(r, ctx)),
    'Person',
    warnings,
  );
  const families = dedupe(
    withXref('FAM').map((r) => readFamily(r, ctx)),
    'Family',
    warnings,
  );
  linkRecords(persons, families, warnings);
  const birthKeys = estimateBirthKeys(persons, families);

  const header: GenealogyData['header'] = {};
  const source = child(head, 'SOUR');
  const sourceSoftware = [childValue(source, 'NAME') ?? source?.value.trim(), childValue(source, 'VERS')]
    .filter(Boolean)
    .join(' ');
  if (sourceSoftware) {
    header.sourceSoftware = sourceSoftware;
  }
  const gedcomVersion = childValue(child(head, 'GEDC'), 'VERS');
  if (gedcomVersion) {
    header.gedcomVersion = gedcomVersion;
  }

  const { text: _text, ...decodedInfo } = decoded;
  return {
    decoded: decodedInfo,
    header,
    persons,
    families,
    places: ctx.places,
    birthKeys,
    warnings,
    stats: {
      persons: persons.length,
      families: families.length,
      events: persons.reduce((n, p) => n + p.events.length, 0) + families.reduce((n, f) => n + f.events.length, 0),
      places: ctx.places.size,
      datedPersons: birthKeys.size,
      ignoredTags: ctx.ignoredTags,
    },
  };
}
