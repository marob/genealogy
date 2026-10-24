/**
 * ANSEL (ANSI/NISO Z39.47) decoder, the historical encoding of GEDCOM 5.x
 * files.
 *
 * Peculiarity: diacritics are combining characters placed BEFORE the letter
 * they modify (e.g. 0xE2 0x65 = "é"). Unicode places them after: they are
 * accumulated and emitted after the base character, then the text is
 * normalized to NFC.
 */

/** Spacing characters of the high range (0xA1–0xCF). */
const SPACING: Record<number, string> = {
  0xa1: '\u0141', // Ł
  0xa2: '\u00d8', // Ø
  0xa3: '\u0110', // Đ
  0xa4: '\u00de', // Þ
  0xa5: '\u00c6', // Æ
  0xa6: '\u0152', // Œ
  0xa7: '\u02b9', // ʹ
  0xa8: '\u00b7', // ·
  0xa9: '\u266d', // ♭
  0xaa: '\u00ae', // ®
  0xab: '\u00b1', // ±
  0xac: '\u01a0', // Ơ
  0xad: '\u01af', // Ư
  0xae: '\u02bc', // ʼ
  0xb0: '\u02bb', // ʻ
  0xb1: '\u0142', // ł
  0xb2: '\u00f8', // ø
  0xb3: '\u0111', // đ
  0xb4: '\u00fe', // þ
  0xb5: '\u00e6', // æ
  0xb6: '\u0153', // œ
  0xb7: '\u02ba', // ʺ
  0xb8: '\u0131', // ı
  0xb9: '\u00a3', // £
  0xba: '\u00f0', // ð
  0xbc: '\u01a1', // ơ
  0xbd: '\u01b0', // ư
  0xbe: '\u25a1', // □ (GEDCOM extension)
  0xbf: '\u25a0', // ■ (GEDCOM extension)
  0xc0: '\u00b0', // °
  0xc1: '\u2113', // ℓ
  0xc2: '\u2117', // ℗
  0xc3: '\u00a9', // ©
  0xc4: '\u266f', // ♯
  0xc5: '\u00bf', // ¿
  0xc6: '\u00a1', // ¡
  0xc7: '\u00df', // ß
  0xc8: '\u20ac', // €
  0xcd: 'e', // e (GEDCOM extension)
  0xce: 'o', // o (GEDCOM extension)
  0xcf: '\u00df', // ß (GEDCOM extension)
};

/** Combining diacritics (0xE0–0xFE), placed before the base letter. */
const COMBINING: Record<number, string> = {
  0xe0: '\u0309', // hook above
  0xe1: '\u0300', // grave
  0xe2: '\u0301', // acute
  0xe3: '\u0302', // circumflex
  0xe4: '\u0303', // tilde
  0xe5: '\u0304', // macron
  0xe6: '\u0306', // breve
  0xe7: '\u0307', // dot above
  0xe8: '\u0308', // diaeresis
  0xe9: '\u030c', // caron
  0xea: '\u030a', // ring above
  0xeb: '\ufe20', // ligature (left half)
  0xec: '\ufe21', // ligature (right half)
  0xed: '\u0315', // comma above right
  0xee: '\u030b', // double acute
  0xef: '\u0310', // candrabindu
  0xf0: '\u0327', // cedilla
  0xf1: '\u0328', // ogonek
  0xf2: '\u0323', // dot below
  0xf3: '\u0324', // diaeresis below
  0xf4: '\u0325', // ring below
  0xf5: '\u0333', // double underline
  0xf6: '\u0332', // underline
  0xf7: '\u0326', // comma below
  0xf8: '\u031c', // left half ring below
  0xf9: '\u032e', // breve below
  0xfa: '\ufe22', // double tilde (left half)
  0xfb: '\ufe23', // double tilde (right half)
  0xfe: '\u0313', // comma above
};

export interface AnselResult {
  text: string;
  /** Number of bytes undefined in ANSEL, replaced with U+FFFD. */
  invalidBytes: number;
}

export function decodeAnsel(bytes: Uint8Array): AnselResult {
  let text = '';
  let pending = '';
  let invalidBytes = 0;

  for (const byte of bytes) {
    if (byte < 0x80) {
      const char = String.fromCodePoint(byte);
      // A diacritic does not apply to a line ending.
      if (pending && (byte === 0x0a || byte === 0x0d)) {
        text += pending;
        pending = '';
      }
      text += char + pending;
      pending = '';
      continue;
    }
    const combining = COMBINING[byte];
    if (combining) {
      pending += combining;
      continue;
    }
    const spacing = SPACING[byte];
    if (spacing) {
      text += spacing + pending;
    } else {
      text += '\ufffd' + pending;
      invalidBytes++;
    }
    pending = '';
  }

  return { text: (text + pending).normalize('NFC'), invalidBytes };
}
