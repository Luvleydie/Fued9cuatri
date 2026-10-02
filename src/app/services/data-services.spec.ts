import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosResponse } from 'axios';
import api from '../core/api/axios-client';
import { OfflineError } from '../core/api/api-errors';
import { CacheMissError, DATA_CACHE_PREFIX, DataValidationError, SessionChangedError } from '../core/api/data-cache';
import { clearSession, readUser, saveSession } from '../core/api/session-storage';
import { CartService } from './cart.service';
import { UsersService } from './users.service';

const account = (id = 1) => ({ id, username: `user${id}`, accessToken: String(id).repeat(64), expiresAt: Math.floor(Date.now() / 1000) + 3600 });
const user = { id: 2, username: 'ana', email: 'ana@example.test' };
const input = { username: 'ana', firstName: 'Ana', lastName: '', email: 'ana@example.test', password: 'Secret123!' };
const products = [{ id: 1, title: 'Producto', price: 12.5, stock: 10 }];
const cart = { items: [{ productId: 1, title: 'Producto', price: 12.5, stock: 10, quantity: 1 }], total: 12.5 };
const updatedCart = { items: [{ ...cart.items[0], quantity: 2 }], total: 25 };

describe('Lecturas y escrituras con caché', () => {
  const users = new UsersService();
  const carts = new CartService();
  beforeEach(() => {
    clearSession(); sessionStorage.clear(); saveSession(account());
    vi.spyOn(api, 'get'); vi.spyOn(api, 'post'); vi.spyOn(api, 'put'); vi.spyOn(api, 'delete');
  });
  afterEach(() => { vi.restoreAllMocks(); clearSession(); });

  it('proyecta sólo campos públicos de usuarios en la respuesta y caché', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { users: [{ ...user, password: 'secreto', accessToken: 'privado' }] } });
    expect((await users.getUsers()).data).toEqual([user]);
    const raw = Object.keys(sessionStorage).filter(key => key.startsWith(DATA_CACHE_PREFIX)).map(key => sessionStorage.getItem(key)).join('');
    expect(raw).not.toContain('password');
    expect(raw).not.toContain('accessToken');
    expect(raw).not.toContain(account().accessToken);
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    expect((await users.getUsers()).data).toEqual([user]);
  });

  it('copia productos y carrito para consulta offline', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { products } }).mockResolvedValueOnce({ data: cart });
    await carts.getProducts();
    await carts.getCart();
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    expect(await carts.getProducts()).toMatchObject({ data: products, source: 'cache' });
    expect(await carts.getCart()).toMatchObject({ data: cart, source: 'cache' });
  });

  it.each(['create', 'update', 'delete'])('invalida usuarios después de confirmar %s', async operation => {
    vi.mocked(api.get).mockResolvedValue({ data: { users: [user] } });
    await users.getUsers();
    vi.mocked(api.post).mockResolvedValue({ data: user });
    vi.mocked(api.put).mockResolvedValue({ data: user });
    vi.mocked(api.delete).mockResolvedValue({});
    if (operation === 'create') await users.createUser(input);
    if (operation === 'update') await users.updateUser(user.id, input);
    if (operation === 'delete') await users.deleteUser(user.id);
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    await expect(users.getUsers()).rejects.toBeInstanceOf(CacheMissError);
  });

  it('conserva la última copia si falla una mutación y no la reintenta', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { users: [user] } });
    await users.getUsers();
    vi.mocked(api.post).mockRejectedValue(new OfflineError());
    await expect(users.createUser(input)).rejects.toBeInstanceOf(OfflineError);
    expect(api.post).toHaveBeenCalledTimes(1);
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    expect((await users.getUsers()).data).toEqual([user]);
  });

  it('actualiza carrito sólo después de confirmar cantidades y eliminación', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: cart });
    await carts.getCart();
    vi.mocked(api.put).mockResolvedValue({ data: updatedCart });
    expect(await carts.setQuantity(1, 2)).toEqual(updatedCart);
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    expect((await carts.getCart()).data).toEqual(updatedCart);
    vi.mocked(api.delete).mockResolvedValue({ data: { items: [], total: 0 } });
    await carts.removeItem(1);
    expect((await carts.getCart()).data).toEqual({ items: [], total: 0 });
  });

  it('no inventa cambios en carrito al fallar la escritura', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: cart });
    await carts.getCart();
    vi.mocked(api.put).mockRejectedValue(new OfflineError());
    await expect(carts.setQuantity(1, 2)).rejects.toBeInstanceOf(OfflineError);
    expect(api.put).toHaveBeenCalledTimes(1);
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    expect((await carts.getCart()).data).toEqual(cart);
  });

  it('rechaza una respuesta de carrito con total inconsistente e invalida la copia anterior', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: cart });
    await carts.getCart();
    vi.mocked(api.put).mockResolvedValue({ data: { ...updatedCart, total: 999 } });
    await expect(carts.setQuantity(1, 2)).rejects.toBeInstanceOf(DataValidationError);
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    await expect(carts.getCart()).rejects.toBeInstanceOf(CacheMissError);
  });

  it('rechaza productos inválidos sin guardarlos', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { products: [{ ...products[0], price: '12.5' }] } });
    await expect(carts.getProducts()).rejects.toBeInstanceOf(DataValidationError);
  });

  it('una escritura tardía no contamina ni confirma cambios en otra sesión', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(api.put).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = carts.setQuantity(1, 2);
    saveSession(account(2));
    finish({ data: updatedCart });
    await expect(pending).rejects.toBeInstanceOf(SessionChangedError);
    vi.mocked(api.get).mockRejectedValue(new OfflineError());
    await expect(carts.getCart()).rejects.toBeInstanceOf(CacheMissError);
  });

  it.each(['create', 'update', 'delete', 'quantity', 'remove'])('convierte el 401 tardío de %s en cambio de sesión sin afectar la cuenta nueva', async operation => {
    let reject!: (reason: unknown) => void;
    const pendingRequest = () => new Promise<never>((_, fail) => { reject = fail; });
    vi.mocked(api.post).mockImplementation(pendingRequest);
    vi.mocked(api.put).mockImplementation(pendingRequest);
    vi.mocked(api.delete).mockImplementation(pendingRequest);
    let pending: Promise<unknown>;
    switch (operation) {
      case 'create': pending = users.createUser(input); break;
      case 'update': pending = users.updateUser(user.id, input); break;
      case 'delete': pending = users.deleteUser(user.id); break;
      case 'quantity': pending = carts.setQuantity(1, 2); break;
      default: pending = carts.removeItem(1);
    }
    clearSession();
    saveSession(account(2));
    reject(new AxiosError('Session expired', 'ERR_BAD_REQUEST', undefined, {}, { status: 401, data: {} } as AxiosResponse));
    await expect(pending).rejects.toBeInstanceOf(SessionChangedError);
    expect(readUser()?.id).toBe(2);
    expect(Object.keys(sessionStorage).some(key => key.startsWith(DATA_CACHE_PREFIX))).toBe(false);
  });
});
