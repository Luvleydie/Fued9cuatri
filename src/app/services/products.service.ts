import { Injectable } from '@angular/core';
import axios from 'axios';
import api from '../core/api/axios-client';
import { MOCK_PRODUCTS } from '../data/mock-products';
import { Product, ProductsResponse, ProductSource } from '../models/product.model';

export class ProductNotFoundError extends Error {
  constructor() {
    super('Producto no encontrado');
    this.name = 'ProductNotFoundError';
  }
}

export function filterProducts(products: Product[], query: string): Product[] {
  const search = query.trim().toLocaleLowerCase();
  return products.filter((product) =>
    [product.title, product.category, product.brand ?? '']
      .some((value) => value.toLocaleLowerCase().includes(search)),
  );
}

@Injectable({ providedIn: 'root' })
export class ProductsService {
  async getProducts(): Promise<{ products: Product[]; source: ProductSource }> {
    try {
      const { data } = await api.get<ProductsResponse>('/products', { params: { limit: 0 } });
      return { products: data.products, source: 'api' };
    } catch (error) {
      if (this.canUseLocalProducts(error)) {
        console.warn('NovaCart: la API de productos no está disponible; se utiliza el catálogo local de demostración.');
        return { products: structuredClone(MOCK_PRODUCTS), source: 'local' };
      }
      throw error;
    }
  }

  async getProduct(id: string | number): Promise<{ product: Product; source: ProductSource }> {
    if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) {
      throw new ProductNotFoundError();
    }
    try {
      const { data } = await api.get<Product>(`/products/${id}`);
      return { product: data, source: 'api' };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new ProductNotFoundError();
      }
      if (this.canUseLocalProducts(error)) {
        const product = MOCK_PRODUCTS.find((item) => item.id === Number(id));
        if (product) {
          console.warn('NovaCart: detalle de demostración recuperado del respaldo local.');
          return { product: structuredClone(product), source: 'local' };
        }
      }
      throw error;
    }
  }

  private canUseLocalProducts(error: unknown): boolean {
    if (!axios.isAxiosError(error) || axios.isCancel(error)) return false;
    if (error.response) return error.response.status >= 500 && error.response.status < 600;
    return ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '');
  }
}
