/** Campos editables del formulario; el servidor asigna id y autor. */
export interface ProductInput {
  title: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  brand?: string;
  thumbnail?: string;
}
