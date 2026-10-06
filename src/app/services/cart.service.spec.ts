import { AxiosError, AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../core/api/axios-client';
import { OfflineError } from '../core/api/api-errors';
import { CacheMissError, DataValidationError, SessionChangedError } from '../core/api/data-cache';
import { clearSession, readUser, saveSession } from '../core/api/session-storage';
import { CartService } from './cart.service';

const account = (id = 1) => ({ id, username: `user${id}`, accessToken: String(id).repeat(64), expiresAt: Math.floor(Date.now() / 1000) + 3600 });
const cart = { items: [{ productId: 1, title: 'Producto', price: 12.5, stock: 10, quantity: 2 }], total: 25 };
const emptyCart = { items: [], total: 0 };

describe('Vaciar carrito confirmado por el servidor', () => {
  const service = new CartService();

  beforeEach(() => {
    clearSession(); sessionStorage.clear(); saveSession(account());
    vi.spyOn(api, 'get').mockResolvedValue({ data: cart });
    vi.spyOn(api, 'delete');
  });
  afterEach(() => { vi.restoreAllMocks(); clearSession(); });

  it('reemplaza la copia con el carrito vacío sólo después de recibir la confirmación', async () => {
    await service.getCart();
    let finish!: (value: unknown) => void;
    vi.mocked(api.delete).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = service.clearCart();
    expect(api.delete).toHaveBeenCalledExactlyOnceWith('/cart');
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    expect((await service.getCart()).data).toEqual(cart);
    finish({ data: emptyCart });
    expect(await pending).toEqual(emptyCart);
    expect(await service.getCart()).toMatchObject({ source: 'cache', data: emptyCart });
  });

  it('conserva la copia confirmada si el borrado falla y no reintenta DELETE', async () => {
    await service.getCart();
    vi.mocked(api.delete).mockRejectedValue(new OfflineError());
    await expect(service.clearCart()).rejects.toBeInstanceOf(OfflineError);
    expect(api.delete).toHaveBeenCalledExactlyOnceWith('/cart');
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    expect((await service.getCart()).data).toEqual(cart);
  });

  it('rechaza una respuesta incoherente e invalida la copia anterior a la escritura', async () => {
    await service.getCart();
    vi.mocked(api.delete).mockResolvedValue({ data: { items: [], total: 25 } });
    await expect(service.clearCart()).rejects.toBeInstanceOf(DataValidationError);
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    await expect(service.getCart()).rejects.toBeInstanceOf(CacheMissError);
  });

  it('un borrado tardío no reemplaza la caché de otra cuenta', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(api.delete).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = service.clearCart();
    saveSession(account(2));
    await service.getCart();
    finish({ data: emptyCart });
    await expect(pending).rejects.toBeInstanceOf(SessionChangedError);
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    expect((await service.getCart()).data).toEqual(cart);
    expect(readUser()?.id).toBe(2);
  });

  it('un 401 tardío se atribuye a la sesión anterior y conserva la nueva', async () => {
    let reject!: (error: unknown) => void;
    vi.mocked(api.delete).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    const pending = service.clearCart();
    saveSession(account(2));
    reject(new AxiosError('expired', 'ERR_BAD_REQUEST', undefined, {}, { status: 401, data: {} } as AxiosResponse));
    await expect(pending).rejects.toBeInstanceOf(SessionChangedError);
    expect(readUser()?.id).toBe(2);
  });
});
