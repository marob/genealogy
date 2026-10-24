import { decodeAnsel } from './ansel.js';

/**
 * Detects the encoding of a GEDCOM file and decodes it to Unicode text.
 *
 * Priority order:
 *  1. BOM (UTF-8, UTF-16 LE/BE);
 *  2. null-byte pattern revealing UTF-16 without a BOM;
 *  3. the file's `1 CHAR` header (ANSEL, UTF-8, UNICODE, ANSI, ASCII...).
 * Common inconsistencies (file declared as ANSI but actually UTF-8, or the
 * reverse) are corrected and reported with a warning.
 */

type GedcomEncoding = 'UTF-8' | 'UTF-16LE' | 'UTF-16BE' | 'ANSEL' | 'WINDOWS-1252' | 'MACINTOSH';

export interface DecodedGedcom {
  text: string;
  encoding: GedcomEncoding;
  /** Value of `1 CHAR` as declared in the file. */
  declaredCharset?: string;
  warnings: string[];
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

function readCharset(head: string): string | undefined {
  return /^\s*1\s+CHAR\s+(.+?)\s*$/im.exec(head)?.[1]?.toUpperCase();
}

function readDeclaredCharset(bytes: Uint8Array): string | undefined {
  // The header is ASCII whatever the 8-bit encoding: read the start of the
  // file as latin1, which cannot fail.
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
    // In UTF-16, the header is only readable once the text is decoded.
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
  // "0 " in UTF-16 without a BOM: 30 00 20 00 (LE) or 00 30 00 20 (BE).
  if (bytes[0] === 0x30 && bytes[1] === 0x00) {
    return result('UTF-16LE');
  }
  if (bytes[0] === 0x00 && bytes[1] === 0x30) {
    return result('UTF-16BE');
  }

  const charset = declaredCharset ?? '';
  const utf8 = isValidUtf8(bytes);

  if (charset === 'ANSEL') {
    // Some software writes "ANSEL" but encodes in UTF-8.
    if (utf8 && hasHighBytes(bytes)) {
      warnings.push('The file declares ANSEL but is encoded in UTF-8: decoding as UTF-8.');
      return result('UTF-8');
    }
    const ansel = decodeAnsel(bytes);
    if (ansel.invalidBytes > 0) {
      warnings.push(`${ansel.invalidBytes} invalid ANSEL byte(s) replaced with "\ufffd".`);
    }
    return result('ANSEL', ansel.text);
  }

  if (charset === 'UTF-8' || charset === 'UTF8' || charset === 'UNICODE') {
    if (utf8) {
      return result('UTF-8');
    }
    warnings.push(`The file declares ${charset} but is not valid UTF-8: decoding as Windows-1252.`);
    return result('WINDOWS-1252');
  }

  if (charset === 'MACINTOSH') {
    return result('MACINTOSH');
  }

  // ANSI, ASCII, IBMPC, missing or unknown.
  if (utf8 && hasHighBytes(bytes)) {
    if (charset) {
      warnings.push(`The file declares ${charset} but is encoded in UTF-8: decoding as UTF-8.`);
    }
    return result('UTF-8');
  }
  if (charset && !['ANSI', 'ASCII', 'IBMPC', 'IBM WINDOWS', 'WINDOWS', 'CP1252'].includes(charset)) {
    warnings.push(`Unknown declared encoding (${charset}): decoding as Windows-1252.`);
  } else if (!charset) {
    warnings.push('No declared encoding (1 CHAR): decoding as Windows-1252.');
  }
  return result('WINDOWS-1252');
}
