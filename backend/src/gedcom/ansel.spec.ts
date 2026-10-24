import { decodeAnsel } from './ansel.js';

const bytes = (...values: (number | string)[]): Uint8Array =>
  Uint8Array.from(
    values.flatMap((value) => (typeof value === 'string' ? [...value].map((char) => char.charCodeAt(0)) : [value])),
  );

describe('decodeAnsel', () => {
  it('laisse l’ASCII intact', () => {
    expect(decodeAnsel(bytes('0 HEAD\r\n1 CHAR ANSEL')).text).toBe('0 HEAD\r\n1 CHAR ANSEL');
  });

  it('place les diacritiques après la lettre et recompose en NFC', () => {
    // é, è, ê, ç, ë
    const { text } = decodeAnsel(bytes('Ren', 0xe2, 'e ', 0xe1, 'e ', 0xe3, 'e Fran', 0xf0, 'cois No', 0xe8, 'el'));
    expect(text).toBe('René è ê François Noël');
    expect(text).toBe(text.normalize('NFC'));
  });

  it('gère les majuscules accentuées utilisées dans les fichiers legacy', () => {
    expect(decodeAnsel(bytes(0xe2, 'E', 'MILE ', 0xe1, 'A')).text).toBe('ÉMILE À');
  });

  it('décode les caractères spéciaux de la plage haute', () => {
    expect(decodeAnsel(bytes(0xb6, 'uvre ', 0xa5, ' ', 0xc7)).text).toBe('œuvre Æ ß');
  });

  it('cumule plusieurs diacritiques sur une même lettre', () => {
    // a + point souscrit + circonflexe → ậ
    expect(decodeAnsel(bytes(0xf2, 0xe3, 'a')).text).toBe('\u1ead');
  });

  it('ne rattache pas un diacritique orphelin au saut de ligne', () => {
    const { text } = decodeAnsel(bytes('a', 0xe2, '\n', 'b'));
    expect(text).toBe('a\u0301\nb'.normalize('NFC'));
  });

  it('remplace et compte les octets non définis', () => {
    const result = decodeAnsel(bytes('a', 0x80, 'b'));
    expect(result.text).toBe('a\ufffdb');
    expect(result.invalidBytes).toBe(1);
  });
});
