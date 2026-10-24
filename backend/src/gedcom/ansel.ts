/**
 * Décodeur ANSEL (ANSI/NISO Z39.47), l'encodage historique des fichiers
 * GEDCOM 5.x.
 *
 * Particularité : les diacritiques sont des caractères combinants placés
 * AVANT la lettre qu'ils modifient (ex. 0xE2 0x65 = « é »). Unicode les place
 * après : on les accumule puis on les émet après le caractère de base, avant
 * de normaliser en NFC.
 */

/** Caractères simples de la plage haute (0xA1–0xCF). */
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
  0xbe: '\u25a1', // □ (extension GEDCOM)
  0xbf: '\u25a0', // ■ (extension GEDCOM)
  0xc0: '\u00b0', // °
  0xc1: '\u2113', // ℓ
  0xc2: '\u2117', // ℗
  0xc3: '\u00a9', // ©
  0xc4: '\u266f', // ♯
  0xc5: '\u00bf', // ¿
  0xc6: '\u00a1', // ¡
  0xc7: '\u00df', // ß
  0xc8: '\u20ac', // €
  0xcd: 'e', // e (extension GEDCOM)
  0xce: 'o', // o (extension GEDCOM)
  0xcf: '\u00df', // ß (extension GEDCOM)
};

/** Diacritiques combinants (0xE0–0xFE), placés avant la lettre de base. */
const COMBINING: Record<number, string> = {
  0xe0: '\u0309', // crochet en chef
  0xe1: '\u0300', // grave
  0xe2: '\u0301', // aigu
  0xe3: '\u0302', // circonflexe
  0xe4: '\u0303', // tilde
  0xe5: '\u0304', // macron
  0xe6: '\u0306', // brève
  0xe7: '\u0307', // point en chef
  0xe8: '\u0308', // tréma
  0xe9: '\u030c', // caron
  0xea: '\u030a', // rond en chef
  0xeb: '\ufe20', // ligature (moitié gauche)
  0xec: '\ufe21', // ligature (moitié droite)
  0xed: '\u0315', // virgule en chef à droite
  0xee: '\u030b', // double aigu
  0xef: '\u0310', // candrabindu
  0xf0: '\u0327', // cédille
  0xf1: '\u0328', // ogonek
  0xf2: '\u0323', // point souscrit
  0xf3: '\u0324', // tréma souscrit
  0xf4: '\u0325', // rond souscrit
  0xf5: '\u0333', // double soulignement
  0xf6: '\u0332', // soulignement
  0xf7: '\u0326', // virgule souscrite
  0xf8: '\u031c', // demi-rond gauche souscrit
  0xf9: '\u032e', // brève souscrite
  0xfa: '\ufe22', // double tilde (moitié gauche)
  0xfb: '\ufe23', // double tilde (moitié droite)
  0xfe: '\u0313', // virgule en chef
};

export interface AnselResult {
  text: string;
  /** Nombre d'octets non définis en ANSEL, remplacés par U+FFFD. */
  invalidBytes: number;
}

export function decodeAnsel(bytes: Uint8Array): AnselResult {
  let text = '';
  let pending = '';
  let invalidBytes = 0;

  for (const byte of bytes) {
    if (byte < 0x80) {
      const char = String.fromCharCode(byte);
      // Un diacritique ne s'applique pas à une fin de ligne.
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
