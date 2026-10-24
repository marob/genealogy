/** Ré-encodage de textes de test dans les encodages historiques GEDCOM. */

const ANSEL_COMBINING: Record<string, number> = {
  '\u0300': 0xe1,
  '\u0301': 0xe2,
  '\u0302': 0xe3,
  '\u0303': 0xe4,
  '\u0308': 0xe8,
  '\u030a': 0xea,
  '\u0327': 0xf0,
};

export function encodeAnsel(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const cluster of text.normalize('NFD').match(/\P{M}\p{M}*/gu) ?? []) {
    const [base, ...marks] = [...cluster];
    for (const mark of marks) {
      const byte = ANSEL_COMBINING[mark];
      if (byte === undefined) {
        throw new Error(`Diacritique non géré dans le test : U+${mark.codePointAt(0)!.toString(16)}`);
      }
      bytes.push(byte);
    }
    if (base!.charCodeAt(0) > 0x7f) {
      throw new Error(`Caractère non ASCII non géré dans le test : ${base}`);
    }
    bytes.push(base!.charCodeAt(0));
  }
  return Uint8Array.from(bytes);
}

const WINDOWS_1252_EXTRA: Record<string, number> = { œ: 0x9c, Œ: 0x8c, '€': 0x80 };

export function encodeWindows1252(text: string): Uint8Array {
  return Uint8Array.from(
    [...text.normalize('NFC')].map((char) => {
      const code = char.charCodeAt(0);
      if (code <= 0xff) {
        return code;
      }
      const byte = WINDOWS_1252_EXTRA[char];
      if (byte === undefined) {
        throw new Error(`Caractère non représentable en Windows-1252 : ${char}`);
      }
      return byte;
    }),
  );
}

export function encodeUtf16le(text: string, bom = true): Uint8Array {
  const bytes = new Uint8Array((bom ? 2 : 0) + text.length * 2);
  let offset = 0;
  if (bom) {
    bytes.set([0xff, 0xfe]);
    offset = 2;
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[offset + i * 2] = code & 0xff;
    bytes[offset + i * 2 + 1] = code >> 8;
  }
  return bytes;
}
