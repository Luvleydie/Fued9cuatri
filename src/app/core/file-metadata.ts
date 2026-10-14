export interface FileMetadata {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export const MAX_METADATA_BYTES = 16_384;

/** Project only public file metadata; never read or serialize the file contents. */
export function getFileMetadata(file: Pick<File, keyof FileMetadata>): FileMetadata {
  return { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified };
}

export function encodeFileMetadata(metadata: FileMetadata): Uint8Array {
  if (!metadata || typeof metadata.name !== 'string' || typeof metadata.type !== 'string'
    || !Number.isSafeInteger(metadata.size) || metadata.size < 0
    || !Number.isSafeInteger(metadata.lastModified) || metadata.lastModified < 0) {
    throw new Error('La metadata del archivo no es válida. Selecciona de nuevo el archivo.');
  }
  const bytes = new TextEncoder().encode(JSON.stringify({
    version: 1,
    type: 'file-metadata',
    file: getFileMetadata(metadata),
  }));
  if (bytes.byteLength > MAX_METADATA_BYTES) {
    throw new Error('La metadata supera el límite de 16 KB. Usa un nombre de archivo más corto.');
  }
  return bytes;
}
