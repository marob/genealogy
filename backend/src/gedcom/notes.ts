/** Text of GEDCOM notes, including the HTML notes of Généatique. */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#')) {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** Plain text of an HTML fragment: block ends become line breaks. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(head|style|script)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\r/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Généatique prefixes its notes with a category, and HTML ones with a
 * marker: "#Générale#HTML<html>…". Returns the readable text.
 */
export function noteText(note: string): string {
  const prefix = /^#[^#\n]*#(HTML)?/.exec(note);
  if (!prefix) {
    return note.trim();
  }
  const body = note.slice(prefix[0].length);
  return prefix[1] ? htmlToText(body) : body.trim();
}
