import { decodeAnsel } from './ansel.js';

const bytes = (...values: (number | string)[]): Uint8Array =>
  Uint8Array.from(
    values.flatMap((value) => (typeof value === 'string' ? [...value].map((char) => char.charCodeAt(0)) : [value])),
  );

describe('decodeAnsel', () => {
  it('leaves ASCII untouched', () => {
    expect(decodeAnsel(bytes('0 HEAD\r\n1 CHAR ANSEL')).text).toBe('0 HEAD\r\n1 CHAR ANSEL');
  });

  it('moves diacritics after the letter and recomposes to NFC', () => {
    // é, è, ê, ç, ë
    const { text } = decodeAnsel(bytes('Ren', 0xe2, 'e ', 0xe1, 'e ', 0xe3, 'e Fran', 0xf0, 'cois No', 0xe8, 'el'));
    expect(text).toBe('René è ê François Noël');
    expect(text).toBe(text.normalize('NFC'));
  });

  it('handles accented capitals used in legacy files', () => {
    expect(decodeAnsel(bytes(0xe2, 'E', 'MILE ', 0xe1, 'A')).text).toBe('ÉMILE À');
  });

  it('decodes the special characters of the high range', () => {
    expect(decodeAnsel(bytes(0xb6, 'uvre ', 0xa5, ' ', 0xc7)).text).toBe('œuvre Æ ß');
  });

  it('stacks several diacritics on the same letter', () => {
    // a + dot below + circumflex → ậ
    expect(decodeAnsel(bytes(0xf2, 0xe3, 'a')).text).toBe('\u1ead');
  });

  it('does not attach an orphan diacritic to a line break', () => {
    const { text } = decodeAnsel(bytes('a', 0xe2, '\n', 'b'));
    expect(text).toBe('a\u0301\nb'.normalize('NFC'));
  });

  it('replaces and counts undefined bytes', () => {
    const result = decodeAnsel(bytes('a', 0x80, 'b'));
    expect(result.text).toBe('a\ufffdb');
    expect(result.invalidBytes).toBe(1);
  });
});
