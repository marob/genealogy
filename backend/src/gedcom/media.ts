/** Documents (OBJE) referenced by a GEDCOM file. */

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  pdf: 'application/pdf',
};

/** Last segment of a path written on any system ("D:\Photos\a.jpg", "../a.jpg"). */
export function baseName(file: string): string {
  return file.split(/[\\/]/).pop()?.trim() ?? '';
}

/**
 * Key matching a GEDCOM reference to a provided file: the file name alone
 * (folders differ from one computer to another), case-insensitive.
 */
export function mediaKey(file: string): string {
  return baseName(file).normalize('NFC').toLowerCase();
}

/** MIME type from the extension; unknown types are served as downloads. */
export function mimeTypeOf(fileName: string): string {
  const extension = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? '';
  return MIME_TYPES[extension] ?? 'application/octet-stream';
}
