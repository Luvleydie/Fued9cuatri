import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import api from '../../core/api/axios-client';
import { CartService } from '../../services/cart.service';
import { clearSession, readUser, saveSession } from '../../core/api/session-storage';
import { CATALOG_PREFERENCES_KEY, readCatalogPreferences, saveCatalogPreferences } from '../../core/catalog-preferences';
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
    localStorage.removeItem(CATALOG_PREFERENCES_KEY);
    vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    router.navigateByUrl.mockResolvedValue(true);
    window.dispatchEvent(new Event('online'));
    service.getProducts.mockResolvedValue(snapshot(products));
    service.getCart.mockResolvedValue(snapshot(cart));
    page = new CartPage(service as unknown as CartService, router as unknown as Router, { markForCheck: vi.fn() } as unknown as ChangeDetectorRef);
  });
  afterEach(() => { vi.restoreAllMocks(); window.dispatchEvent(new Event('online')); clearSession(); localStorage.removeItem(CATALOG_PREFERENCES_KEY); });

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

  it('filtra títulos sin cambiar el catálogo ni perder las cantidades guardadas', async () => {
    await page.loadCart();
    page.products = [...products, { id: 2, title: 'Teclado compacto', price: 100, stock: 8 }];
    page.searchQuery = '  tECLado  ';
    expect(page.filteredProducts.map(product => product.id)).toEqual([2]);
    expect(page.products).toHaveLength(2);
    expect(page.unitCount).toBe(2);
    page.searchQuery = 'inexistente';
    expect(page.filteredProducts).toEqual([]);
    page.searchQuery = '  ';
    expect(page.filteredProducts).toHaveLength(2);
  });

  it('el resumen cuenta cantidades confirmadas aunque el control tenga un borrador', async () => {
    await page.loadCart();
    page.quantityRows.at(0).controls.quantity.setValue(9);
    expect(page.unitCount).toBe(2);
    expect(page.selectedProductCount).toBe(1);
    expect(page.total).toBe(400);
    page.setCart({ items: [], total: 0 });
    expect(page.unitCount).toBe(0);
    expect(page.selectedProductCount).toBe(0);
  });

  it('permite cerrar sesión y limpia el carrito aunque el servidor falle', async () => {
    saveSession({ id: 9, username: 'demo', accessToken: 'a'.repeat(64), expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    await page.loadCart();
    vi.mocked(api.post).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    await page.logout();
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(readUser()).toBeNull();
    expect(page.items).toEqual([]);
    expect(page.products).toEqual([]);
    expect(page.quantityRows.length).toBe(0);
    expect(page.currentUsername).toBe('');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login', { replaceUrl: true });
    expect(page.isSubmitting).toBe(false);
  });

  it('ignora una consulta pendiente que responde después de cerrar sesión', async () => {
    let completeProducts!: (value: ReturnType<typeof snapshot<typeof products>>) => void;
    service.getProducts.mockImplementation(() => new Promise(resolve => { completeProducts = resolve; }));
    const pending = page.loadCart();
    await page.logout();
    completeProducts(snapshot(products));
    await pending;
    expect(page.items).toEqual([]);
    expect(page.products).toEqual([]);
    expect(page.cartSnapshot).toBeNull();
    expect(page.isLoading).toBe(false);
  });
});

describe('Búsqueda, filtros y orden del catálogo', () => {
  const products = [
    { id: 4, title: 'Cámara web', price: 50, stock: 0 },
    { id: 2, title: 'Teclado mecánico', price: 250, stock: 3 },
    { id: 3, title: 'Audífonos inalámbricos', price: 50, stock: 5 },
    { id: 1, title: 'Ratón   Óptico', price: 125, stock: 10 },
  ];
  const createPage = () => new CartPage({} as CartService, {} as Router, {} as ChangeDetectorRef);
  const selectEvent = (value: string) => ({ target: { value } }) as unknown as Event;
  let page: CartPage;

  beforeEach(() => {
    localStorage.removeItem(CATALOG_PREFERENCES_KEY);
    page = createPage();
    page.products = [...products];
  });
  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(CATALOG_PREFERENCES_KEY); window.dispatchEvent(new Event('online')); });

  it('combina búsquedas sin tildes con disponibilidad y conserva todo el catálogo', () => {
    page.searchQuery = '  RÁTON óptico ';
    page.updateProductAvailability(selectEvent('available'));
    expect(page.filteredProducts.map(product => product.id)).toEqual([1]);
    page.updateProductAvailability(selectEvent('unavailable'));
    expect(page.filteredProducts).toEqual([]);
    expect(page.hasCatalogFilters).toBe(true);
    expect(page.products).toEqual(products);
  });

  it.each([
    ['default', [4, 2, 3, 1]], ['name', [3, 4, 1, 2]],
    ['price-asc', [3, 4, 1, 2]], ['price-desc', [2, 1, 3, 4]],
  ])('ordena por %s y desempata por ID sin modificar productos', (sort, ids) => {
    page.updateProductSort(selectEvent(sort as string));
    expect(page.filteredProducts.map(product => product.id)).toEqual(ids);
    expect(page.products).toEqual(products);
  });

  it('los filtros siguen disponibles offline aunque las escrituras estén bloqueadas', () => {
    window.dispatchEvent(new Event('offline'));
    page.updateProductAvailability(selectEvent('available'));
    page.updateProductSort(selectEvent('price-desc'));
    expect(page.readOnly).toBe(true);
    expect(page.filteredProducts.map(product => product.id)).toEqual([2, 1, 3]);
  });

  it('recupera preferencias al crear la página y mantiene la búsqueda vacía', () => {
    saveCatalogPreferences({ sort: 'price-desc', availability: 'unavailable' });
    const restored = createPage();
    expect(restored.sortOrder).toBe('price-desc');
    expect(restored.availabilityFilter).toBe('unavailable');
    expect(restored.searchQuery).toBe('');
  });

  it('rechaza valores desconocidos recibidos desde eventos', () => {
    page.updateProductSort(selectEvent('invalid'));
    page.updateProductAvailability(selectEvent('invalid'));
    expect(page.hasCatalogFilters).toBe(false);
    expect(localStorage.getItem(CATALOG_PREFERENCES_KEY)).toBeNull();
  });

  it('limpia búsqueda y preferencias sin cambiar cantidades ni catálogo', () => {
    page.searchQuery = 'cámara';
    page.updateProductSort(selectEvent('name'));
    page.updateProductAvailability(selectEvent('unavailable'));
    page.setCart({ items: [{ productId: 1, title: products[3].title, price: 125, quantity: 2, stock: 10 }], total: 250 });
    page.resetCatalogFilters();
    expect(page.hasCatalogFilters).toBe(false);
    expect(readCatalogPreferences()).toEqual({ sort: 'default', availability: 'all' });
    expect(page.filteredProducts).toEqual(products);
    expect(page.unitCount).toBe(2);
    expect(page.total).toBe(250);
  });

  it('explorar productos restablece filtros para mostrar el catálogo completo', () => {
    const focus = vi.fn();
    vi.spyOn(document, 'getElementById').mockReturnValue({ focus } as unknown as HTMLElement);
    page.searchQuery = 'sin resultado';
    page.updateProductAvailability(selectEvent('unavailable'));
    page.focusCatalog();
    expect(page.hasCatalogFilters).toBe(false);
    expect(page.filteredProducts).toHaveLength(products.length);
    expect(focus).toHaveBeenCalledOnce();
  });
});
