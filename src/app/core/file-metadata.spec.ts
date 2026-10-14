import { describe, expect, it, vi } from 'vitest';
import { encodeFileMetadata, FileMetadata, getFileMetadata, MAX_METADATA_BYTES } from './file-metadata';

const metadata: FileMetadata = { name: 'documento.pdf', size: 1234, type: 'application/pdf', lastModified: 1234567 };

describe('Metadata pública del archivo', () => {
  it('proyecta sólo los cuatro campos sin acceder al contenido ni serializar campos adicionales', () => {
    const file = {
      ...metadata,
      body: 'contenido privado',
      path: '/ruta/privada',
      arrayBuffer: vi.fn(() => { throw new Error('No se debe leer'); }),
      text: vi.fn(() => { throw new Error('No se debe leer'); }),
      toJSON: () => ({ body: 'contenido privado' }),
    };
    expect(getFileMetadata(file)).toEqual(metadata);
    expect(JSON.parse(new TextDecoder().decode(encodeFileMetadata(file)))).toEqual({
      version: 1, type: 'file-metadata', file: metadata,
    });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(file.text).not.toHaveBeenCalled();
  });

  it('conserva Unicode, archivo vacío y tipo MIME desconocido', () => {
    const file = { ...metadata, name: 'México 📄.txt', size: 0, type: '' };
    expect(JSON.parse(new TextDecoder().decode(encodeFileMetadata(file))).file).toEqual(file);
  });

  it.each([
    { size: -1 }, { size: 0.5 }, { size: Infinity }, { size: Number.MAX_SAFE_INTEGER + 1 },
    { lastModified: NaN }, { lastModified: -1 }, { lastModified: 1.5 }, { type: undefined }, { name: null },
  ])('rechaza metadata inválida: %o', invalid => {
    expect(() => encodeFileMetadata({ ...metadata, ...invalid } as FileMetadata)).toThrow('metadata del archivo no es válida');
  });

  it('limita bytes UTF-8, con aceptación del límite exacto', () => {
    const base = { ...metadata, name: '' };
    const overhead = encodeFileMetadata(base).byteLength;
    expect(encodeFileMetadata({ ...base, name: 'a'.repeat(MAX_METADATA_BYTES - overhead) }).byteLength).toBe(MAX_METADATA_BYTES);
    expect(() => encodeFileMetadata({ ...base, name: 'a'.repeat(MAX_METADATA_BYTES - overhead + 1) })).toThrow('16 KB');
    expect(() => encodeFileMetadata({ ...base, name: '📄'.repeat(5000) })).toThrow('16 KB');
  });
});
