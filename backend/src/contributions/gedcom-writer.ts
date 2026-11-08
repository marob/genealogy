import type { Sex } from '@genealogie/shared';

/** Minimal GEDCOM 5.5.1 writer for the export of contributions. */

export interface GedEvent {
  date?: string;
  place?: string;
}

export interface GedPerson {
  id: string;
  givenNames: string;
  surname: string;
  sex: Sex;
  occupation?: string;
  birth?: GedEvent;
  death?: GedEvent;
  notes: string[];
  media: { file: string; title?: string }[];
  famc: string[];
  fams: string[];
}

export interface GedFamily {
  id: string;
  husband?: string;
  wife?: string;
  children: string[];
  marriage?: GedEvent;
  notes: string[];
}

/** Splits a text into GEDCOM lines (CONT for line breaks, CONC beyond 200 characters). */
function textLines(level: number, tag: string, text: string): string[] {
  const lines: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const chunks = line.match(/.{1,200}/gsu) ?? [''];
    chunks.forEach((chunk, chunkIndex) => {
      if (index === 0 && chunkIndex === 0) {
        lines.push(`${level} ${tag} ${chunk}`.trimEnd());
      } else {
        lines.push(`${level + 1} ${chunkIndex === 0 ? 'CONT' : 'CONC'} ${chunk}`.trimEnd());
      }
    });
  });
  return lines;
}

function eventLines(tag: string, event: GedEvent | undefined): string[] {
  if (!event || (!event.date && !event.place)) {
    return [];
  }
  return [
    `1 ${tag}`,
    ...(event.date ? [`2 DATE ${event.date}`] : []),
    ...(event.place ? [`2 PLAC ${event.place}`] : []),
  ];
}

function extension(file: string): string {
  return /\.([^.]+)$/.exec(file)?.[1]?.toLowerCase() ?? '';
}

export function writeGedcom(
  persons: GedPerson[],
  families: GedFamily[],
  header: { day: string; placeForm?: string },
): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, dayOfMonth] = header.day.split('-').map(Number) as [number, number, number];
  const lines = [
    '0 HEAD',
    '1 SOUR GENEALOGIEROBERT',
    '2 NAME genealogierobert (contributions)',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    `1 DATE ${dayOfMonth} ${months[month - 1]} ${year}`,
    // Same place format as the genealogy software's export, so places are split alike.
    ...(header.placeForm ? ['1 PLAC', `2 FORM ${header.placeForm}`] : []),
  ];
  for (const person of persons) {
    lines.push(
      `0 @${person.id}@ INDI`,
      `1 NAME ${person.givenNames} /${person.surname}/`.replace(/ {2,}/g, ' '),
      ...(person.givenNames ? [`2 GIVN ${person.givenNames}`] : []),
      ...(person.surname ? [`2 SURN ${person.surname}`] : []),
      `1 SEX ${person.sex}`,
      ...(person.occupation ? [`1 OCCU ${person.occupation}`] : []),
      ...eventLines('BIRT', person.birth),
      ...eventLines('DEAT', person.death),
      // Same document structure as Généatique's exports.
      ...person.media.flatMap((media) => [
        '1 _IMAGE',
        '2 OBJE',
        `3 FILE ${media.file}`,
        ...(extension(media.file) ? [`4 FORM ${extension(media.file)}`] : []),
        ...(media.title ? [`3 TITL ${media.title}`] : []),
      ]),
      ...person.notes.flatMap((note) => textLines(1, 'NOTE', note)),
      ...person.fams.map((id) => `1 FAMS @${id}@`),
      ...person.famc.map((id) => `1 FAMC @${id}@`),
    );
  }
  for (const family of families) {
    lines.push(
      `0 @${family.id}@ FAM`,
      ...(family.husband ? [`1 HUSB @${family.husband}@`] : []),
      ...(family.wife ? [`1 WIFE @${family.wife}@`] : []),
      ...eventLines('MARR', family.marriage),
      ...family.notes.flatMap((note) => textLines(1, 'NOTE', note)),
      ...family.children.map((id) => `1 CHIL @${id}@`),
    );
  }
  lines.push('0 TRLR', '');
  return lines.join('\r\n');
}
