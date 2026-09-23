export interface Product {
  id: number;
  title: string;
  price: number;
  stock: number;
}

export interface ProductsResponse {
  products: Product[];
}
