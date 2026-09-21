import { describe, expect, it } from 'vitest';
import { ProductInput } from '../../models/product-input.model';
import { normalizeProductInput, validateProductInput } from './product-form';

describe('Formulario de inventario', () => {
  const input: ProductInput = { title: 'Cuaderno', description: 'Cuaderno con hojas', category: 'Papelería', price: 19.95, stock: 5 };

  it('acepta un objeto válido y conserva cero en precio y existencias', () => {
    expect(validateProductInput(input)).toEqual({});
    expect(validateProductInput({ ...input, price: 0, stock: 0 })).toEqual({});
  });

  it('limpia los campos de texto sin cambiar valores numéricos', () => {
    expect(normalizeProductInput({ ...input, title: ' Cuaderno ', brand: ' Marca ' })).toEqual({ ...input, title: 'Cuaderno', brand: 'Marca', thumbnail: '' });
  });

  it('rechaza campos requeridos que sólo contienen espacios', () => {
    expect(Object.keys(validateProductInput({ ...input, title: '  ', description: '\t', category: '\n' }))).toEqual(['title', 'description', 'category']);
  });

  it.each([-1, 1000000.01, 0.001, 1.999, NaN, Infinity])('rechaza precio %s antes de guardar', price => {
    expect(validateProductInput({ ...input, price }).price).toBeTruthy();
  });

  it.each([-1, 1.1, 1000001, NaN, Infinity])('rechaza existencias %s antes de guardar', stock => {
    expect(validateProductInput({ ...input, stock }).stock).toBeTruthy();
  });

  it('rechaza textos que exceden los límites acordados con la API', () => {
    expect(Object.keys(validateProductInput({ ...input, title: 'x'.repeat(161), description: 'x'.repeat(2001), category: 'x'.repeat(81), brand: 'x'.repeat(121) }))).toEqual(['title', 'description', 'category', 'brand']);
  });

  it('valida la longitud del texto limpio y permite saltos de línea en la descripción', () => {
    expect(validateProductInput({ ...input, title: ` ${'x'.repeat(160)} `, description: 'Primera línea\nSegunda línea', brand: ` ${'x'.repeat(120)} ` })).toEqual({});
  });

  it.each(['title', 'description', 'category', 'brand'] as const)('rechaza caracteres de control en %s como la API', field => {
    expect(validateProductInput({ ...input, [field]: 'Texto\u0000inválido' })[field]).toBeTruthy();
  });

  it.each(['https://example.com/image.jpg', 'http://example.com/image.png', 'assets/products/product-placeholder.svg', 'assets/products/image..png', ''])('permite imagen %s', thumbnail => {
    expect(validateProductInput({ ...input, thumbnail }).thumbnail).toBeUndefined();
  });

  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg></svg>', 'https://user:password@example.com/image.jpg', 'assets/../private', 'assets\\image.svg', '//example.com/image.jpg', 'assets/', 'assets/./image.svg', 'assets//image.svg', 'assets/image.svg/', 'assets/image?.svg', 'assets/imagen nueva.svg', 'https://example.com/image name.jpg'])('rechaza dirección de imagen %s', thumbnail => {
    expect(validateProductInput({ ...input, thumbnail }).thumbnail).toBeTruthy();
  });
});
