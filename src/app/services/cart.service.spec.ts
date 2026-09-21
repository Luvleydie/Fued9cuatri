import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Product } from '../models/product.model';
import { CartService } from './cart.service';

const product = (changes: Partial<Product> = {}): Product => ({
  id: 1, title: 'Producto de prueba', description: 'Descripción', category: 'beauty',
  price: 9.99, stock: 3, ...changes,
});

describe('CartService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('incrementa duplicados, respeta stock y conserva cantidades al recargar', () => {
    const cart = new CartService();
    expect(cart.addProduct(product())).toBe(true);
    expect(cart.addProduct(product())).toBe(true);
    expect(cart.increaseQuantity(1)).toBe(true);
    expect(cart.increaseQuantity(1)).toBe(false);
    expect(cart.addProduct(product({ id: 2, stock: 0 }))).toBe(false);
    expect(cart.items()).toHaveLength(1);
    expect(new CartService().getTotalItems()).toBe(3);
    cart.decreaseQuantity(1);
    cart.decreaseQuantity(1);
    cart.decreaseQuantity(1);
    expect(cart.items()[0].quantity).toBe(1);
  });

  it('suma subtotales en centavos y no aplica de nuevo el descuento informativo', () => {
    const cart = new CartService();
    cart.addProduct(product({ price: 0.1, discountPercentage: 50 }));
    cart.addProduct(product({ id: 2, price: 0.2 }));
    expect(cart.getTotal()).toBe(0.3);
    cart.increaseQuantity(1);
    expect(cart.getSubtotal(cart.items()[0])).toBe(0.2);
    expect(cart.getTotal()).toBe(0.4);
  });

  it('descarta registros inválidos, une duplicados y limita cantidades restauradas', () => {
    localStorage.setItem('novacart.cart', JSON.stringify([
      { product: product(), quantity: 100 },
      { product: product(), quantity: 2 },
      { product: product({ id: 2 }), quantity: 1.5 },
      { product: product({ id: 3, price: -5 }), quantity: 1 },
      { product: product({ id: 4, stock: 0 }), quantity: 1 },
      { product: product({ id: 5 }), quantity: -1 },
      { product: null, quantity: 1 }, null,
    ]));
    const cart = new CartService();
    expect(cart.items()).toEqual([{ product: product(), quantity: 3 }]);
    expect(JSON.parse(localStorage.getItem('novacart.cart')!)).toEqual(cart.items());
  });

  it.each(['{', 'null', '{"items":[]}'])('recupera un carrito vacío ante almacenamiento corrupto: %s', (raw) => {
    localStorage.setItem('novacart.cart', raw);
    const cart = new CartService();
    expect(cart.getItems()).toEqual([]);
    expect(cart.getTotal()).toBe(0);
    expect(localStorage.getItem('novacart.cart')).toBe('[]');
  });

  it('persiste eliminación y vaciado sin borrar otros datos del navegador', () => {
    localStorage.setItem('novacart.token', 'session');
    const cart = new CartService();
    cart.addProduct(product());
    cart.addProduct(product({ id: 2 }));
    cart.removeProduct(1);
    expect(new CartService().items().map((item) => item.product.id)).toEqual([2]);
    cart.clearCart();
    expect(new CartService().getItems()).toEqual([]);
    expect(localStorage.getItem('novacart.token')).toBe('session');
  });

  it('funciona en memoria cuando el navegador bloquea localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const cart = new CartService();
    cart.addProduct(product());
    expect(cart.getTotal()).toBe(9.99);
    expect(cart.persistenceError()).toContain('No se pudo guardar');
  });

  it('avisa de un fallo de escritura y reintenta guardar las cantidades actuales', () => {
    const cart = new CartService();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    cart.addProduct(product());
    cart.increaseQuantity(1);
    expect(cart.persistenceError()).toContain('Reintenta antes de cerrar');
    expect(localStorage.getItem('novacart.cart')).toBe('[]');
    write.mockRestore();
    cart.retryPersistence();
    expect(cart.persistenceError()).toBe('');
    expect(new CartService().items()).toEqual([{ product: product(), quantity: 2 }]);
  });

  it('conserva el aviso si el reintento falla y persiste el borrado cuando se recupera', () => {
    const cart = new CartService();
    cart.addProduct(product());
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    cart.removeProduct(1);
    cart.retryPersistence();
    expect(cart.persistenceError()).not.toBe('');
    expect(JSON.parse(localStorage.getItem('novacart.cart')!)).toHaveLength(1);
    write.mockRestore();
    cart.retryPersistence();
    expect(cart.persistenceError()).toBe('');
    expect(new CartService().items()).toEqual([]);
  });
});
