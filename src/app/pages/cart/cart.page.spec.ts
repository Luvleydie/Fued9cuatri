import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { CartService } from '../../services/cart.service';
import { clearSession } from '../../core/api/session-storage';
import { CartPage } from './cart.page';

describe('Carrito ante fallos de acceso', () => {
  const products = [{ id: 1, title: 'Mouse', price: 200, stock: 10 }];
  const cart = { items: [{ productId: 1, title: 'Mouse', price: 200, stock: 10, quantity: 2 }], total: 400 };
  const snapshot = <T>(data: T, source: 'network' | 'cache' = 'network') => ({ data, source, savedAt: Date.now(), storage: 'session' as const });
  const service = { getProducts: vi.fn(), getCart: vi.fn(), setQuantity: vi.fn(), removeItem: vi.fn() };
  const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
  let page: CartPage;

  beforeEach(() => {
    vi.resetAllMocks();
    window.dispatchEvent(new Event('online'));
    service.getProducts.mockResolvedValue(snapshot(products));
    service.getCart.mockResolvedValue(snapshot(cart));
    page = new CartPage(service as unknown as CartService, router as unknown as Router, { markForCheck: vi.fn() } as unknown as ChangeDetectorRef);
  });
  afterEach(() => { window.dispatchEvent(new Event('online')); clearSession(); });

  it('muestra los productos aunque falle el carrito y no muestra un total vacío como confirmado', async () => {
    service.getCart.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    await page.loadCart();
    expect(page.products).toEqual(products);
    expect(page.cartSnapshot).toBeNull();
    expect(page.readOnly).toBe(true);
    expect(page.errorMessage).toContain('conectar');
    expect(page.isLoading).toBe(false);
  });

  it('consulta cache sin permitir escrituras y exige actualizar tras recuperar la red', async () => {
    service.getCart.mockResolvedValue(snapshot(cart, 'cache'));
    await page.loadCart();
    await page.setQuantity(1, 3);
    expect(service.setQuantity).not.toHaveBeenCalled();
    expect(page.cartNotice).toContain('copia temporal');
    window.dispatchEvent(new Event('online'));
    expect(page.readOnly).toBe(true);
    service.getCart.mockResolvedValue(snapshot(cart));
    await page.loadCart();
    expect(page.readOnly).toBe(false);
  });

  it('conserva cantidades si una escritura no se confirma y nunca la reintenta automáticamente', async () => {
    await page.loadCart();
    service.setQuantity.mockRejectedValue(new AxiosError('Timeout', 'ECONNABORTED'));
    await page.setQuantity(1, 3);
    expect(page.items[0].quantity).toBe(2);
    expect(page.total).toBe(400);
    expect(page.errorMessage).toContain('confirmar');
    expect(page.needsRefresh).toBe(true);
    await page.setQuantity(1, 3);
    expect(service.setQuantity).toHaveBeenCalledTimes(1);
    expect(page.isSubmitting).toBe(false);
  });

  it('da prioridad al 401 sobre un fallo de red paralelo y borra datos visibles', async () => {
    await page.loadCart();
    service.getProducts.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    service.getCart.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
    await page.loadCart();
    expect(page.items).toEqual([]);
    expect(page.products).toEqual([]);
    expect(page.cartSnapshot).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login?expired=1', { replaceUrl: true });
  });

  it.each([null, 0, -1, 1.5, 11, 100])('valida la cantidad %s en FormArray antes de enviar', async quantity => {
    await page.loadCart();
    page.quantityRows.at(0).controls.quantity.setValue(quantity);
    await page.saveQuantity(0);
    expect(service.setQuantity).not.toHaveBeenCalled();
    expect(page.quantityError(0)).not.toBe('');
    expect(page.items[0].quantity).toBe(2);
  });

  it('envía el valor del control y actualiza el modelo sólo al confirmarse', async () => {
    await page.loadCart();
    page.quantityRows.at(0).controls.quantity.setValue(3);
    service.setQuantity.mockResolvedValue({ items: [{ ...cart.items[0], quantity: 3 }], total: 600 });
    await page.saveQuantity(0);
    expect(service.setQuantity).toHaveBeenCalledWith(1, 3);
    expect(page.items[0].quantity).toBe(3);
    expect(page.quantityRows.at(0).controls.quantity.value).toBe(3);
    expect(page.quantityRows.pristine).toBe(true);
  });

  it('conserva el borrador de cantidad cuando no se confirma el guardado', async () => {
    await page.loadCart();
    page.quantityRows.at(0).controls.quantity.setValue(3);
    service.setQuantity.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    await page.saveQuantity(0);
    expect(page.quantityRows.at(0).controls.quantity.value).toBe(3);
    expect(page.items[0].quantity).toBe(2);
    expect(page.total).toBe(400);
  });

  it('conserva el borrador de otra fila al confirmar un artículo', () => {
    const second = { productId: 2, title: 'Teclado', price: 100, stock: 8, quantity: 1 };
    page.setCart({ items: [cart.items[0], second], total: 500 });
    const draft = page.quantityRows.at(1).controls.quantity;
    draft.setValue(4);
    draft.markAsDirty();
    page.setCart({ items: [{ ...cart.items[0], quantity: 3 }, second], total: 700 }, true, 1);
    expect(page.quantityRows.at(1).controls.quantity.value).toBe(4);
    expect(page.quantityRows.at(1).dirty).toBe(true);
    expect(page.items[1].quantity).toBe(1);
  });
});
