import { Injectable } from '@angular/core';
import api from '../core/api/axios-client';
import { CartResponse } from '../models/cart-item.model';
import { Product, ProductsResponse } from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class CartService {
  async getProducts(): Promise<Product[]> {
    const { data } = await api.get<ProductsResponse>('/products');
    return data.products;
  }

  async getCart(): Promise<CartResponse> {
    const { data } = await api.get<CartResponse>('/cart');
    return data;
  }

  // "Setear" es asignar una cantidad: PUT envía ese valor a PHP y MySQL.
  async setQuantity(productId: number, quantity: number): Promise<CartResponse> {
    const { data } = await api.put<CartResponse>(`/cart/${productId}`, { quantity });
    return data;
  }

  async removeItem(productId: number): Promise<CartResponse> {
    const { data } = await api.delete<CartResponse>(`/cart/${productId}`);
    return data;
  }
}
