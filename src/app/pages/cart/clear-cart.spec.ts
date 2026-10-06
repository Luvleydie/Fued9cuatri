import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartService } from '../../services/cart.service';
import { CartPage } from './cart.page';

describe('Vaciar el carrito con confirmación', () => {
  const products = [{ id: 1, title: 'Mouse', price: 200, stock: 10 }];
  const cart = { items: [{ productId: 1, title: 'Mouse', price: 200, stock: 10, quantity: 2 }], total: 400 };
  const snapshot = <T>(data: T, source: 'network' | 'cache' = 'network') => ({ data, source, savedAt: Date.now(), storage: 'session' as const });
  const service = { getProducts: vi.fn(), getCart: vi.fn(), clearCart: vi.fn() };
  const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
  let page: CartPage;

  beforeEach(async () => {
    vi.resetAllMocks();
    window.dispatchEvent(new Event('online'));
    service.getProducts.mockResolvedValue(snapshot(products));
    service.getCart.mockResolvedValue(snapshot(structuredClone(cart)));
    service.clearCart.mockResolvedValue({ items: [], total: 0 });
    page = new CartPage(service as unknown as CartService, router as unknown as Router, { markForCheck: vi.fn() } as unknown as ChangeDetectorRef);
    await page.loadCart();
  });

  afterEach(() => { vi.restoreAllMocks(); window.dispatchEvent(new Event('online')); });

  it('solicita confirmación sin enviar una escritura', () => {
    page.requestClearCart();
    expect(page.clearConfirmationOpen).toBe(true);
    expect(service.clearCart).not.toHaveBeenCalled();
    expect(page.total).toBe(400);
  });

  it('limpia modelo, controles y resumen solamente cuando el servidor confirma', async () => {
    let resolve!: (value: { items: []; total: number }) => void;
    service.clearCart.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = page.clearCart();
    expect(page.isSubmitting).toBe(true);
    expect(page.total).toBe(400);
    expect(page.items).toHaveLength(1);
    resolve({ items: [], total: 0 });
    await pending;
    expect(page.items).toEqual([]);
    expect(page.quantityRows.length).toBe(0);
    expect(page.total).toBe(0);
    expect(page.cartSnapshot?.data).toEqual({ items: [], total: 0 });
    expect(page.successMessage).toBe('El carrito se vació.');
    expect(page.isSubmitting).toBe(false);
  });

  it('un segundo clic durante la escritura no envía otra solicitud', async () => {
    let resolve!: (value: { items: []; total: number }) => void;
    service.clearCart.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = page.clearCart();
    await page.clearCart();
    page.requestClearCart();
    expect(service.clearCart).toHaveBeenCalledTimes(1);
    expect(page.clearConfirmationOpen).toBe(false);
    resolve({ items: [], total: 0 });
    await pending;
  });

  it('conserva selección y borradores ante un fallo y exige actualizar', async () => {
    page.quantityRows.at(0).controls.quantity.setValue(4);
    service.clearCart.mockRejectedValue(new AxiosError('Timeout', 'ECONNABORTED'));
    await page.clearCart();
    expect(page.items).toEqual(cart.items);
    expect(page.total).toBe(400);
    expect(page.quantityRows.at(0).controls.quantity.value).toBe(4);
    expect(page.successMessage).toBe('');
    expect(page.errorMessage).toContain('confirmar');
    expect(page.needsRefresh).toBe(true);
    await page.clearCart();
    expect(service.clearCart).toHaveBeenCalledTimes(1);
    expect(page.isSubmitting).toBe(false);
  });

  it.each(['offline', 'cache', 'loading', 'empty'])('bloquea confirmación y borrado cuando el estado es %s', async state => {
    if (state === 'offline') window.dispatchEvent(new Event('offline'));
    if (state === 'cache') page.cartSnapshot = snapshot(cart, 'cache');
    if (state === 'loading') page.isLoading = true;
    if (state === 'empty') page.setCart({ items: [], total: 0 });
    page.requestClearCart();
    await page.clearCart();
    expect(page.clearConfirmationOpen).toBe(false);
    expect(service.clearCart).not.toHaveBeenCalled();
  });

  it('si la red cae con la confirmación abierta no envía el borrado', async () => {
    page.requestClearCart();
    window.dispatchEvent(new Event('offline'));
    await page.clearCart();
    expect(service.clearCart).not.toHaveBeenCalled();
    expect(page.total).toBe(400);
  });

  it('borra los datos visibles y vuelve a login si el servidor rechaza la sesión', async () => {
    service.clearCart.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
    await page.clearCart();
    expect(page.items).toEqual([]);
    expect(page.products).toEqual([]);
    expect(page.cartSnapshot).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login?expired=1', { replaceUrl: true });
  });
});
