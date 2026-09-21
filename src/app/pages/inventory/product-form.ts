import { ProductInput } from '../../models/product-input.model';

export type ProductFormErrors = Partial<Record<keyof ProductInput, string>>;

export function emptyProductInput(): ProductInput {
  return { title: '', description: '', category: '', price: 0, stock: 0, brand: '', thumbnail: '' };
}

export function normalizeProductInput(input: ProductInput): ProductInput {
  return {
    title: input.title.trim(), description: input.description.trim(), category: input.category.trim(),
    price: input.price, stock: input.stock, brand: input.brand?.trim() ?? '', thumbnail: input.thumbnail?.trim() ?? '',
  };
}

export function validateProductInput(input: ProductInput): ProductFormErrors {
  const errors: ProductFormErrors = {};
  if (!input.title.trim() || input.title.trim().length > 160) errors.title = 'Escribe un nombre de 1 a 160 caracteres.';
  if (!input.description.trim() || input.description.trim().length > 2000) errors.description = 'Escribe una descripción de 1 a 2000 caracteres.';
  if (!input.category.trim() || input.category.trim().length > 80) errors.category = 'Escribe una categoría de 1 a 80 caracteres.';
  if (typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price < 0 || input.price > 1000000 || !/^\d+(?:\.\d{1,2})?$/.test(String(input.price))) {
    errors.price = 'El precio debe estar entre 0 y 1,000,000, con un máximo de dos decimales.';
  }
  if (!Number.isInteger(input.stock) || input.stock < 0 || input.stock > 1000000) errors.stock = 'Las existencias deben ser un entero entre 0 y 1,000,000.';
  if ((input.brand?.trim().length ?? 0) > 120) errors.brand = 'La marca puede tener hasta 120 caracteres.';
  for (const field of ['title', 'description', 'category', 'brand'] as const) {
    if (!errors[field] && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input[field]?.trim() ?? '')) {
      errors[field] = 'El texto contiene caracteres de control no permitidos.';
    }
  }
  const thumbnail = input.thumbnail?.trim() ?? '';
  if (thumbnail && !validThumbnail(thumbnail)) errors.thumbnail = 'Usa una URL http(s) sin credenciales o una ruta relativa dentro de assets/, de hasta 2000 caracteres.';
  return errors;
}

function validThumbnail(value: string): boolean {
  if (value.length > 2000 || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  if (value.startsWith('assets/')) {
    return /^assets\/[a-zA-Z0-9_./-]+$/u.test(value) && !value.split('/').some(part => part === '..' || part === '.' || part === '');
  }
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
