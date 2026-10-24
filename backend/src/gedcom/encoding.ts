import { decodeAnsel } from './ansel.js';

/**
 * Détection de l'encodage d'un fichier GEDCOM et décodage en texte Unicode.
 *
 * Ordre de priorité :
 *  1. BOM (UTF-8, UTF-16 LE/BE) ;
 *  2. motif d'octets nuls révélant de l'UTF-16 sans BOM ;
 *  3. en-tête `1 CHAR` du fichier (ANSEL, UTF-8, UNICODE, ANSI, ASCII…).
 * Les incohérences fréquentes (fichier déclaré ANSI mais réellement en UTF-8,
 * ou l'inverse) sont corrigées et signalées par un avertissement.
 */

type GedcomEncoding = 'UTF-8' | 'UTF-16LE' | 'UTF-16BE' | 'ANSEL' | 'WINDOWS-1252' | 'MACINTOSH';

export interface DecodedGedcom {
  text: string;
  encoding: GedcomEncoding;
  /** Valeur de `1 CHAR` telle que déclarée dans le fichier. */
  declaredCharset?: string;
  warnings: string[];
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

function readCharset(head: string): string | undefined {
  return /^\s*1\s+CHAR\s+(.+?)\s*$/im.exec(head)?.[1]?.toUpperCase();
}

function readDeclaredCharset(bytes: Uint8Array): string | undefined {
  // L'en-tête est en ASCII quel que soit l'encodage 8 bits : on lit le début
  // du fichier en latin1, ce qui ne peut pas échouer.
  return readCharset(new TextDecoder('latin1').decode(bytes.subarray(0, 4096)));
}

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    strictUtf8.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function hasHighBytes(bytes: Uint8Array): boolean {
  return bytes.some((byte) => byte >= 0x80);
}

function decodeWith(bytes: Uint8Array, encoding: GedcomEncoding): string {
  const label = encoding === 'MACINTOSH' ? 'macintosh' : encoding.toLowerCase();
  return new TextDecoder(label).decode(bytes);
}

export function decodeGedcom(bytes: Uint8Array): DecodedGedcom {
  const warnings: string[] = [];
  const declaredCharset = readDeclaredCharset(bytes);
  const result = (encoding: GedcomEncoding, text = decodeWith(bytes, encoding)): DecodedGedcom => {
    const decoded: DecodedGedcom = { text: text.replace(/^\ufeff/, ''), encoding, warnings };
    // En UTF-16, l'en-tête n'est lisible qu'une fois le texte décodé.
    const charset = encoding.startsWith('UTF-16') ? readCharset(decoded.text.slice(0, 4096)) : declaredCharset;
    if (charset) {
      decoded.declaredCharset = charset;
    }
    return decoded;
  };

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return result('UTF-8');
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return result('UTF-16LE');
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return result('UTF-16BE');
  }
  // "0 " en UTF-16 sans BOM : 30 00 20 00 (LE) ou 00 30 00 20 (BE).
  if (bytes[0] === 0x30 && bytes[1] === 0x00) {
    return result('UTF-16LE');
  }
  if (bytes[0] === 0x00 && bytes[1] === 0x30) {
    return result('UTF-16BE');
  }

  const charset = declaredCharset ?? '';
  const utf8 = isValidUtf8(bytes);

  if (charset === 'ANSEL') {
    // Certains logiciels écrivent « ANSEL » mais encodent en UTF-8.
    if (utf8 && hasHighBytes(bytes)) {
      warnings.push('Le fichier déclare ANSEL mais est encodé en UTF-8 : décodage en UTF-8.');
      return result('UTF-8');
    }
    const ansel = decodeAnsel(bytes);
    if (ansel.invalidBytes > 0) {
      warnings.push(`${ansel.invalidBytes} octet(s) invalide(s) en ANSEL ont été remplacés par « \ufffd ».`);
    }
    return result('ANSEL', ansel.text);
  }

  if (charset === 'UTF-8' || charset === 'UTF8' || charset === 'UNICODE') {
    if (utf8) {
      return result('UTF-8');
    }
    warnings.push(`Le fichier déclare ${charset} mais n'est pas de l'UTF-8 valide : décodage en Windows-1252.`);
    return result('WINDOWS-1252');
  }

  if (charset === 'MACINTOSH') {
    return result('MACINTOSH');
  }

  // ANSI, ASCII, IBMPC, absent ou inconnu.
  if (utf8 && hasHighBytes(bytes)) {
    if (charset) {
      warnings.push(`Le fichier déclare ${charset} mais est encodé en UTF-8 : décodage en UTF-8.`);
    }
    return result('UTF-8');
  }
  if (charset && !['ANSI', 'ASCII', 'IBMPC', 'IBM WINDOWS', 'WINDOWS', 'CP1252'].includes(charset)) {
    warnings.push(`Encodage déclaré inconnu (${charset}) : décodage en Windows-1252.`);
  } else if (!charset) {
    warnings.push('Aucun encodage déclaré (1 CHAR) : décodage en Windows-1252.');
  }
  return result('WINDOWS-1252');
}
