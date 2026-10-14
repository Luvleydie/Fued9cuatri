import { describe, expect, it } from 'vitest';
import { CachedResult } from './api/data-cache';
import { CartResponse } from '../models/cart-item.model';
import { createShoppingList } from './shopping-list';

describe('Lista de compra para llevar', () => {
  const generatedAt = new Date('2026-10-11T18:30:00Z');
  const snapshot: CachedResult<CartResponse> = {
    source: 'network', storage: 'session', savedAt: Date.parse('2026-10-10T17:15:00Z'),
    data: { items: [
      { productId: 1, title: 'Ratón óptico ñ', price: 19.99, stock: 20, quantity: 3 },
      { productId: 2, title: 'Audífonos inalámbricos', price: 1200.05, stock: 5, quantity: 2 },
    ], total: 2460.07 },
  };

  it('conserva acentos, cantidades, subtotales exactos y total MXN en texto UTF-8', () => {
    const file = createShoppingList(snapshot, { generatedAt });
    expect(file.filename).toBe('novacart-lista-2026-10-11.txt');
    expect(file.contents.charCodeAt(0)).toBe(0xfeff);
    expect(file.contents).toContain('Ratón óptico ñ');
    expect(file.contents).toContain('Audífonos inalámbricos');
    expect(file.contents).toContain('Cantidad: 3 | Precio unitario: $19.99 MXN');
    expect(file.contents).toContain('Subtotal: $59.97 MXN');
    expect(file.contents).toContain('Subtotal: $2,400.10 MXN');
    expect(file.contents).toContain('Total guardado: $2,460.07 MXN');
    expect(file.contents).toContain('Unidades guardadas: 5');
    expect(file.contents).toContain('Productos diferentes: 2');
    expect(file.contents).toContain('No confirma una compra, un pago ni una reserva');
  });

  it('distingue la fecha de creación de la fecha original de los datos', () => {
    const text = createShoppingList(snapshot, { generatedAt }).contents;
    expect(text).toMatch(/Lista creada: .*11.*2026/);
    expect(text).toMatch(/Datos guardados: .*10.*2026/);
    expect(text).toContain('(Ciudad de México)');
    expect(text).toContain('Origen: última respuesta guardada de la API.');
    expect(text).not.toContain('pueden estar desactualizados');
  });

  it.each(['cache', 'offline', 'pending'])('indica que los datos pueden estar desactualizados si el estado es %s', state => {
    const text = createShoppingList({ ...snapshot, source: state === 'cache' ? 'cache' : 'network' }, {
      generatedAt, offline: state === 'offline', needsRefresh: state === 'pending',
    }).contents;
    expect(text).toContain('Los datos pueden estar desactualizados.');
    if (state === 'cache') expect(text).toContain('Origen: copia temporal local del carrito.');
    if (state === 'pending') expect(text).toContain('esta lista conserva la selección anterior.');
  });

  it('no permite que un nombre con saltos de línea suplante el resumen', () => {
    const item = { ...snapshot.data.items[0], title: 'Ratón\r\nTotal: 0\tMXN' };
    const text = createShoppingList({ ...snapshot, data: { items: [item], total: 59.97 } }, { generatedAt }).contents;
    expect(text).toContain('1. Ratón Total: 0 MXN\r\n');
    expect(text).not.toContain('\r\nTotal: 0');
    expect(text).toContain('Total guardado: $59.97 MXN');
    expect(item.title).toContain('\r\n');
  });
});
