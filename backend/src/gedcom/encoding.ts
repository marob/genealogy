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
  return /^[ \t]*1[ \t]+CHAR[ \t]+([^\r\n]+)/im.exec(head)?.[1]?.trim().toUpperCase();
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

/** Charsets declaring UTF-8. */
const UTF8_CHARSETS = new Set(['UTF-8', 'UTF8', 'UNICODE']);
/** Known 8-bit charsets decoded as Windows-1252. */
const WINDOWS_1252_CHARSETS = new Set(['ANSI', 'ASCII', 'IBMPC', 'IBM WINDOWS', 'WINDOWS', 'CP1252']);

/** Chosen encoding, with the decoded text when it needs a dedicated decoder. */
interface EncodingChoice {
  encoding: GedcomEncoding;
  text?: string;
}

/** Encoding revealed by a BOM or by the null bytes of UTF-16 without a BOM. */
function detectUnicodeSignature(bytes: Uint8Array): GedcomEncoding | undefined {
  const [first, second, third] = bytes;
  if (first === 0xef && second === 0xbb && third === 0xbf) {
    return 'UTF-8';
  }
  if (first === 0xff && second === 0xfe) {
    return 'UTF-16LE';
  }
  if (first === 0xfe && second === 0xff) {
    return 'UTF-16BE';
  }
  // "0 " in UTF-16 without a BOM: 30 00 20 00 (LE) or 00 30 00 20 (BE).
  if (first === 0x30 && second === 0x00) {
    return 'UTF-16LE';
  }
  if (first === 0x00 && second === 0x30) {
    return 'UTF-16BE';
  }
  return undefined;
}

function chooseAnsel(bytes: Uint8Array, utf8: boolean, warnings: string[]): EncodingChoice {
  // Some software writes "ANSEL" but encodes in UTF-8.
  if (utf8 && hasHighBytes(bytes)) {
    warnings.push('The file declares ANSEL but is encoded in UTF-8: decoding as UTF-8.');
    return { encoding: 'UTF-8' };
  }
  const ansel = decodeAnsel(bytes);
  if (ansel.invalidBytes > 0) {
    warnings.push(`${ansel.invalidBytes} invalid ANSEL byte(s) replaced with "\ufffd".`);
  }
  return { encoding: 'ANSEL', text: ansel.text };
}

function chooseUtf8(charset: string, utf8: boolean, warnings: string[]): EncodingChoice {
  if (utf8) {
    return { encoding: 'UTF-8' };
  }
  warnings.push(`The file declares ${charset} but is not valid UTF-8: decoding as Windows-1252.`);
  return { encoding: 'WINDOWS-1252' };
}

/** ANSI, ASCII, IBMPC, missing or unknown charset. */
function chooseWindows1252(bytes: Uint8Array, charset: string, utf8: boolean, warnings: string[]): EncodingChoice {
  if (utf8 && hasHighBytes(bytes)) {
    if (charset) {
      warnings.push(`The file declares ${charset} but is encoded in UTF-8: decoding as UTF-8.`);
    }
    return { encoding: 'UTF-8' };
  }
  if (!charset) {
    warnings.push('No declared encoding (1 CHAR): decoding as Windows-1252.');
  } else if (!WINDOWS_1252_CHARSETS.has(charset)) {
    warnings.push(`Unknown declared encoding (${charset}): decoding as Windows-1252.`);
  }
  return { encoding: 'WINDOWS-1252' };
}

/** Encoding of a file without a Unicode signature, from its `1 CHAR` header and its bytes. */
function chooseFromCharset(bytes: Uint8Array, charset: string, warnings: string[]): EncodingChoice {
  const utf8 = isValidUtf8(bytes);
  if (charset === 'ANSEL') {
    return chooseAnsel(bytes, utf8, warnings);
  }
  if (UTF8_CHARSETS.has(charset)) {
    return chooseUtf8(charset, utf8, warnings);
  }
  if (charset === 'MACINTOSH') {
    return { encoding: 'MACINTOSH' };
  }
  return chooseWindows1252(bytes, charset, utf8, warnings);
}

export function decodeGedcom(bytes: Uint8Array): DecodedGedcom {
  const warnings: string[] = [];
  const declaredCharset = readDeclaredCharset(bytes);
  const signature = detectUnicodeSignature(bytes);
  const { encoding, text = decodeWith(bytes, encoding) } = signature
    ? { encoding: signature }
    : chooseFromCharset(bytes, declaredCharset ?? '', warnings);

  const decoded: DecodedGedcom = { text: text.replace(/^\ufeff/, ''), encoding, warnings };
  // In UTF-16, the header is only readable once the text is decoded.
  const charset = encoding.startsWith('UTF-16') ? readCharset(decoded.text.slice(0, 4096)) : declaredCharset;
  if (charset) {
    decoded.declaredCharset = charset;
  }
  return decoded;
}
