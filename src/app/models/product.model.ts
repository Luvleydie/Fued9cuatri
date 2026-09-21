export interface Product {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  discountPercentage?: number;
  rating?: number;
  stock?: number;
  brand?: string;
  thumbnail?: string;
  images?: string[];
}

export interface ProductsResponse {
  products: Product[];
  total: number;
  skip: number;
  limit: number;
}

export type ProductSource = 'api' | 'local';

/** Objeto que consume el catálogo, incluyendo el origen visible de los datos. */
export interface ProductListResult {
  products: Product[];
  source: ProductSource;
}

/** Objeto que consume la pantalla de detalle. */
export interface ProductDetailResult {
  product: Product;
  source: ProductSource;
}
