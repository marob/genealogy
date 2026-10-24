/** Normalization for search: lowercase, without accents or extra whitespace. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll('œ', 'oe')
    .replaceAll('æ', 'ae')
    .replaceAll('ß', 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
