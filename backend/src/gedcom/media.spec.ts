import { baseName, mediaKey, mimeTypeOf } from './media.js';
import { parseGedcom } from './gedcom-parser.js';

describe('media helpers', () => {
  it('keeps only the file name of a Windows or relative path', () => {
    expect(baseName('D:\\Photos arbre généalogique\\ROBERT\\ROBERT Marcel.jpg')).toBe('ROBERT Marcel.jpg');
    expect(baseName('../ROBERT/Actes/184.png')).toBe('184.png');
    expect(mediaKey('C:\\Photos\\Décès.JPG')).toBe(mediaKey('décès.jpg'));
  });

  it('serves unknown types as downloads', () => {
    expect(mimeTypeOf('acte.PDF')).toBe('application/pdf');
    expect(mimeTypeOf('photo.jpeg')).toBe('image/jpeg');
    expect(mimeTypeOf('page.svg')).toBe('application/octet-stream');
  });
});

describe('documents in a GEDCOM file', () => {
  const result = parseGedcom(
    new TextEncoder().encode(
      [
        '0 HEAD',
        '1 CHAR UTF-8',
        '0 @I1@ INDI',
        '1 NAME Louis /ROBERT/',
        '1 _IMAGE',
        '2 OBJE',
        '3 FILE D:\\Photos\\ROBERT Louis.jpg',
        '1 _IMAGE',
        '2 OBJE',
        '3 FILE ..\\..\\Photos\\robert louis.JPG',
        '1 BIRT',
        '2 DATE 1870',
        '2 OBJE',
        '3 FILE Naissance Louis.png',
        '1 OBJE @O1@',
        '0 @F1@ FAM',
        '1 HUSB @I1@',
        '1 MARR',
        '2 OBJE',
        '3 FILE Mariage.pdf',
        '0 @O1@ OBJE',
        '1 FILE portrait.jpg',
        '1 TITL Portrait de Louis',
        '0 TRLR',
      ].join('\n'),
    ),
  );

  it('reads the documents of persons and families, with their event', () => {
    expect(result.persons[0]?.media).toEqual([
      { file: 'D:\\Photos\\ROBERT Louis.jpg' },
      { file: 'Naissance Louis.png', eventType: 'BIRT' },
      { file: 'portrait.jpg', title: 'Portrait de Louis' },
    ]);
    expect(result.families[0]?.media).toEqual([{ file: 'Mariage.pdf', eventType: 'MARR' }]);
    expect(result.stats.media).toBe(4);
  });

  it('does not report the document containers as ignored tags', () => {
    expect(result.stats.ignoredTags).toEqual({});
    expect(result.warnings).toEqual([]);
  });
});
