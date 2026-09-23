// La interfaz describe la forma de un artículo; no guarda ni asigna datos por sí sola.
export interface CartItem {
  productId: number;
  title: string;
  price: number;
  quantity: number;
  stock: number;
}

export interface CartResponse {
  items: CartItem[];
  total: number;
}
