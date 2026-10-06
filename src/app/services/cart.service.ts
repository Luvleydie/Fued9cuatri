import { Injectable } from '@angular/core';
import api from '../core/api/axios-client';
import { CartResponse } from '../models/cart-item.model';
import { Product, ProductsResponse } from '../models/product.model';
import { CachedResult, fetchWithCache, invalidateDataCache, replaceDataCache, runSessionMutation, SessionChangedError } from '../core/api/data-cache';
import { projectCart, projectProducts } from '../core/api/data-projections';
import { readCacheScope } from '../core/api/session-storage';

@Injectable({ providedIn: 'root' })
export class CartService {
  async getProducts(): Promise<CachedResult<Product[]>> {
    const scope = readCacheScope();
    return fetchWithCache('products', scope, readCacheScope, async () => {
      const { data } = await api.get<ProductsResponse>('/products');
      return data?.products;
    }, projectProducts);
  }

  async getCart(): Promise<CachedResult<CartResponse>> {
    const scope = readCacheScope();
    return fetchWithCache('cart', scope, readCacheScope, async () => {
      const { data } = await api.get<CartResponse>('/cart');
      return data;
    }, projectCart);
  }

  // "Setear" es asignar una cantidad: PUT envía ese valor a PHP y MySQL.
  async setQuantity(productId: number, quantity: number): Promise<CartResponse> {
    const scope = readCacheScope();
    // Este método entrega el carrito cuando PHP confirma la escritura en MySQL.
    const { data } = await runSessionMutation(scope, readCacheScope, () => api.put<CartResponse>(`/cart/${productId}`, { quantity }));
    return this.confirmCart(data, scope);
  }

  async removeItem(productId: number): Promise<CartResponse> {
    const scope = readCacheScope();
    const { data } = await runSessionMutation(scope, readCacheScope, () => api.delete<CartResponse>(`/cart/${productId}`));
    return this.confirmCart(data, scope);
  }

  async clearCart(): Promise<CartResponse> {
    const scope = readCacheScope();
    const { data } = await runSessionMutation(scope, readCacheScope, () => api.delete<CartResponse>('/cart'));
    return this.confirmCart(data, scope);
  }

  private confirmCart(value: unknown, scope: string | null): CartResponse {
    // La respuesta debe ser válida antes de reemplazar la copia del carrito.
    if (scope !== readCacheScope()) throw new SessionChangedError();
    invalidateDataCache('cart', scope);
    const data = projectCart(value);
    replaceDataCache('cart', scope, data, projectCart);
    return data;
  }
}
