import { decodeGedcom } from './encoding.js';

const header = (charset: string): string => `0 HEAD\n1 CHAR ${charset}\n0 @I1@ INDI\n1 NAME `;
const latin1 = (text: string): Uint8Array => Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('decodeGedcom', () => {
  it('decodes UTF-8 with a BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(header('UTF-8') + 'Émile')]);
    const result = decodeGedcom(bytes);
    expect(result.encoding).toBe('UTF-8');
    expect(result.text.startsWith('0 HEAD')).toBe(true);
    expect(result.text).toContain('Émile');
  });

  it('decodes UTF-16 LE with and without a BOM', () => {
    const text = header('UNICODE') + 'Zoé';
    const le = new Uint8Array(text.length * 2);
    [...text].forEach((char, i) => {
      le[i * 2] = char.charCodeAt(0);
    });
    expect(decodeGedcom(new Uint8Array([0xff, 0xfe, ...le])).text).toContain('Zoé');
    expect(decodeGedcom(le)).toMatchObject({ encoding: 'UTF-16LE' });
  });

  it('decodes UTF-16 BE without a BOM', () => {
    const text = header('UNICODE') + 'Zoé';
    const be = new Uint8Array(text.length * 2);
    [...text].forEach((char, i) => {
      be[i * 2 + 1] = char.charCodeAt(0);
    });
    expect(decodeGedcom(be)).toMatchObject({ encoding: 'UTF-16BE' });
    expect(decodeGedcom(be).text).toContain('Zoé');
  });

  it('decodes UTF-16 BE with a BOM', () => {
    const text = header('UNICODE') + 'Zoé';
    const be = new Uint8Array(text.length * 2);
    [...text].forEach((char, i) => {
      be[i * 2 + 1] = char.charCodeAt(0);
    });
    const result = decodeGedcom(new Uint8Array([0xfe, 0xff, ...be]));
    expect(result).toMatchObject({ encoding: 'UTF-16BE', declaredCharset: 'UNICODE' });
    expect(result.text.startsWith('0 HEAD')).toBe(true);
  });

  it('reports invalid ANSEL bytes', () => {
    const result = decodeGedcom(new Uint8Array([...latin1(header('ANSEL') + 'a'), 0x80, ...latin1('b')]));
    expect(result.encoding).toBe('ANSEL');
    expect(result.text).toContain('a\ufffdb');
    expect(result.warnings).toEqual(['1 invalid ANSEL byte(s) replaced with "\ufffd".']);
  });

  it('decodes declared MACINTOSH', () => {
    const result = decodeGedcom(new Uint8Array([...latin1(header('MACINTOSH') + 'Ren'), 0x8e]));
    expect(result).toMatchObject({ encoding: 'MACINTOSH', declaredCharset: 'MACINTOSH', warnings: [] });
    expect(result.text).toContain('René');
  });

  it('reports an unknown declared encoding', () => {
    const result = decodeGedcom(latin1(header('EBCDIC') + 'Paul'));
    expect(result.encoding).toBe('WINDOWS-1252');
    expect(result.warnings).toEqual(['Unknown declared encoding (EBCDIC): decoding as Windows-1252.']);
  });

  it('decodes declared ANSEL', () => {
    const bytes = new Uint8Array([...latin1(header('ANSEL') + 'Ren'), 0xe2, ...latin1('e')]);
    const result = decodeGedcom(bytes);
    expect(result).toMatchObject({ encoding: 'ANSEL', declaredCharset: 'ANSEL', warnings: [] });
    expect(result.text).toContain('René');
  });

  it('corrects a file declared as ANSEL but encoded in UTF-8', () => {
    const result = decodeGedcom(utf8(header('ANSEL') + 'René'));
    expect(result.encoding).toBe('UTF-8');
    expect(result.text).toContain('René');
    expect(result.warnings).toHaveLength(1);
  });

  it('decodes ANSI as Windows-1252 (œ, €)', () => {
    const bytes = new Uint8Array([...latin1(header('ANSI') + 'C'), 0x9c, ...latin1('ur '), 0x80]);
    const result = decodeGedcom(bytes);
    expect(result.encoding).toBe('WINDOWS-1252');
    expect(result.text).toContain('Cœur €');
    expect(result.warnings).toEqual([]);
  });

  it('corrects a file declared as ANSI but encoded in UTF-8', () => {
    const result = decodeGedcom(utf8(header('ANSI') + 'Hélène'));
    expect(result.encoding).toBe('UTF-8');
    expect(result.text).toContain('Hélène');
    expect(result.warnings).toHaveLength(1);
  });

  it('falls back to Windows-1252 for declared but invalid UTF-8', () => {
    const bytes = new Uint8Array([...latin1(header('UTF-8') + 'H'), 0xe9, ...latin1('l')]);
    const result = decodeGedcom(bytes);
    expect(result.encoding).toBe('WINDOWS-1252');
    expect(result.text).toContain('Hél');
    expect(result.warnings).toHaveLength(1);
  });

  it('reports a missing encoding declaration', () => {
    const result = decodeGedcom(latin1('0 HEAD\n0 TRLR'));
    expect(result.encoding).toBe('WINDOWS-1252');
    expect(result.declaredCharset).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
  });
});
