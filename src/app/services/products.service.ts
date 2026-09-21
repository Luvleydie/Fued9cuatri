import { Injectable } from '@angular/core';
import axios from 'axios';
import api from '../core/api/axios-client';
import { MOCK_PRODUCTS } from '../data/mock-products';
import { Product, ProductsResponse, ProductListResult, ProductDetailResult } from '../models/product.model';
import { ProductInput } from '../models/product-input.model';

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
  async getProducts(): Promise<ProductListResult> {
    try {
      return { products: await this.getInventory(), source: 'api' };
    } catch (error) {
      if (this.canUseLocalProducts(error)) {
        console.warn('NovaCart: la API de productos no está disponible; se utiliza el catálogo local de demostración.');
        return { products: structuredClone(MOCK_PRODUCTS), source: 'local' };
      }
      throw error;
    }
  }

  async getProduct(id: string | number): Promise<ProductDetailResult> {
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

  /** La gestión siempre consulta la base de datos; nunca presenta datos de respaldo como persistidos. */
  async getInventory(): Promise<Product[]> {
    const { data } = await api.get<ProductsResponse>('/products', { params: { limit: 0 } });
    return data.products;
  }

  async createProduct(input: ProductInput): Promise<Product> {
    const { data } = await api.post<Product>('/products', input);
    return data;
  }

  async updateProduct(id: number, input: ProductInput): Promise<Product> {
    this.requireProductId(id);
    const { data } = await api.put<Product>(`/products/${id}`, input);
    return data;
  }

  async deleteProduct(id: number): Promise<void> {
    this.requireProductId(id);
    await api.delete(`/products/${id}`);
  }

  private requireProductId(id: number): void {
    if (!Number.isSafeInteger(id) || id < 1) throw new ProductNotFoundError();
  }

  private canUseLocalProducts(error: unknown): boolean {
    if (!axios.isAxiosError(error) || axios.isCancel(error)) return false;
    if (error.response) return error.response.status >= 500 && error.response.status < 600;
    return ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '');
  }
}
