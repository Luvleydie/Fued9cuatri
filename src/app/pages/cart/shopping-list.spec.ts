import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartService } from '../../services/cart.service';
import { CartPage } from './cart.page';

describe('Lista del carrito en web y móvil', () => {
  const cart = { items: [{ productId: 1, title: 'Ratón óptico', price: 19.99, stock: 10, quantity: 3 }], total: 59.97 };
  let page: CartPage;
  const makePage = () => {
    const result = new CartPage({} as CartService, {} as Router, { markForCheck: vi.fn() } as unknown as ChangeDetectorRef);
    result.cartSnapshot = { data: structuredClone(cart), source: 'network', savedAt: Date.parse('2026-10-11T18:30:00Z'), storage: 'session' };
    result.setCart(result.cartSnapshot.data);
    return result;
  };

  beforeEach(() => {
    window.dispatchEvent(new Event('online'));
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    page = makePage();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.dispatchEvent(new Event('online'));
  });

  it('prepara la selección guardada y excluye cantidades aún en el formulario', () => {
    page.quantityRows.at(0).controls.quantity.setValue(9);
    page.openShoppingList();
    expect(page.shoppingListOpen).toBe(true);
    expect(page.shoppingListFile?.contents).toContain('Cantidad: 3');
    expect(page.shoppingListFile?.contents).not.toContain('Cantidad: 9');
    expect(page.shoppingListFile?.contents).toContain('Total guardado: $59.97 MXN');
  });

  it.each(['loading', 'submitting', 'empty', 'unavailable'])('no prepara la lista si el estado es %s', state => {
    if (state === 'loading') page.isLoading = true;
    if (state === 'submitting') page.isSubmitting = true;
    if (state === 'empty') page.setCart({ items: [], total: 0 });
    if (state === 'unavailable') page.cartSnapshot = null;
    page.openShoppingList();
    expect(page.shoppingListOpen).toBe(false);
    expect(page.shoppingListFile).toBeNull();
  });

  it('permite llevar una copia offline identificada sin modificar datos', () => {
    window.dispatchEvent(new Event('offline'));
    page.cartSnapshot!.source = 'cache';
    page.openShoppingList();
    expect(page.shoppingListOpen).toBe(true);
    expect(page.shoppingListFile?.contents).toContain('Origen: copia temporal local');
    expect(page.shoppingListFile?.contents).toContain('pueden estar desactualizados');
    expect(page.items).toEqual(cart.items);
  });

  it('copia la lista con sus acentos en móvil y no permite intentar una descarga Blob', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    page = makePage();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const anchor = vi.spyOn(document, 'createElement');
    page.openShoppingList();
    await page.copyShoppingList();
    page.downloadShoppingList();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Ratón óptico'));
    expect(writeText.mock.calls[0][0]).not.toMatch(/^\uFEFF/);
    expect(page.shoppingListMessage).toContain('Lista copiada');
    expect(anchor).not.toHaveBeenCalled();
  });

  it('si el portapapeles falla selecciona el texto para permitir copiarlo manualmente', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) } });
    const textarea = { focus: vi.fn(), select: vi.fn() };
    vi.spyOn(document, 'getElementById').mockReturnValue(textarea as unknown as HTMLTextAreaElement);
    page.openShoppingList();
    await page.copyShoppingList();
    expect(textarea.focus).toHaveBeenCalledOnce();
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(page.shoppingListMessage).toContain('Selecciona el texto');
    expect(page.isCopyingList).toBe(false);
  });

  it('descarga TXT UTF-8 en web, elimina el enlace y libera el objeto temporal', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn().mockReturnValue('blob:shopping-list');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    let downloadedName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedName = this.download;
      expect(this.href).toBe('blob:shopping-list');
    });
    page.openShoppingList();
    page.downloadShoppingList();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(downloadedName).toMatch(/^novacart-lista-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(page.shoppingListMessage).toContain('Se solicitó la descarga');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shopping-list');
  });

  it('cierra la lista y no restaura mensajes cuando una copia pendiente finaliza', async () => {
    let resolve!: () => void;
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockImplementation(() => new Promise<void>(done => { resolve = done; })) } });
    page.openShoppingList();
    const pending = page.copyShoppingList();
    page.closeShoppingList();
    resolve();
    await pending;
    expect(page.shoppingListFile).toBeNull();
    expect(page.shoppingListMessage).toBe('');
    expect(page.shoppingListOpen).toBe(false);
  });
});
