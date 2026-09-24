export const SUBMISSION_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const SUBMISSION_FILE_ACCEPTED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'heic',
  'csv',
  'xlsx',
  'xls',
  'json',
  'geojson',
] as const;
export const SUBMISSION_FILE_ACCEPT = SUBMISSION_FILE_ACCEPTED_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(',');

const DENIED_MIME_TYPES = new Set(['text/html', 'image/svg+xml']);

/** Converts browser file names to the bounded leaf name accepted by PublicAPI. */
export function sanitizeSubmissionFileName(value: string): string {
  const leaf = value.split(/[\\/]/).pop()?.trim() || 'upload.bin';
  return leaf.replace(/[^\w.\- ()]/g, '_').slice(0, 160) || 'upload.bin';
}

/** Applies the same size, extension, and active-content denylist as the facade. */
export function validateSubmissionFile(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (file.size <= 0) return 'File is empty.';
  if (file.size > SUBMISSION_FILE_MAX_BYTES) {
    return 'File is too large (max 10MB).';
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (
    !(SUBMISSION_FILE_ACCEPTED_EXTENSIONS as readonly string[]).includes(
      extension,
    ) ||
    DENIED_MIME_TYPES.has(file.type.toLowerCase())
  ) {
    return 'Unsupported file type.';
  }
  return null;
}
