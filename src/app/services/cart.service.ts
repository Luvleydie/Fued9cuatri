import { computed, Injectable, signal } from '@angular/core';
import { CartItem } from '../models/cart-item.model';
import { Product } from '../models/product.model';

const STORAGE_KEY = 'novacart.cart';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly storageError = signal('');
  readonly persistenceError = this.storageError.asReadonly();
  private readonly cartItems = signal<CartItem[]>(this.restore());
  readonly items = this.cartItems.asReadonly();
  readonly totalItems = computed(() => this.items().reduce((sum, item) => sum + item.quantity, 0));
  private readonly totalCents = computed(() =>
    this.items().reduce((sum, item) => sum + this.unitCents(item.product) * item.quantity, 0),
  );

  addProduct(product: Product): boolean {
    const validProduct = this.readProduct(product);
    if (!validProduct || this.getStockLimit(validProduct) < 1) return false;
    const existing = this.items().find((item) => item.product.id === product.id);
    if (existing) return this.increaseQuantity(product.id);
    this.save([...this.items(), { product: validProduct, quantity: 1 }]);
    return true;
  }

  removeProduct(productId: number): void {
    this.save(this.items().filter((item) => item.product.id !== productId));
  }

  increaseQuantity(productId: number): boolean {
    const item = this.items().find((entry) => entry.product.id === productId);
    if (!item || item.quantity >= this.getStockLimit(item.product)) return false;
    this.save(this.items().map((entry) =>
      entry.product.id === productId ? { ...entry, quantity: entry.quantity + 1 } : entry,
    ));
    return true;
  }

  decreaseQuantity(productId: number): void {
    this.save(this.items().map((item) =>
      item.product.id === productId && item.quantity > 1
        ? { ...item, quantity: item.quantity - 1 }
        : item,
    ));
  }

  getItems(): CartItem[] {
    return this.items().map((item) => ({ ...item, product: { ...item.product } }));
  }

  getTotalItems(): number {
    return this.totalItems();
  }

  getTotal(): number {
    return this.totalCents() / 100;
  }

  getSubtotal(item: CartItem): number {
    return (this.unitCents(item.product) * item.quantity) / 100;
  }

  getStockLimit(product: Product): number {
    return product.stock ?? Number.MAX_SAFE_INTEGER;
  }

  clearCart(): void {
    this.save([]);
  }

  retryPersistence(): void {
    this.persist(this.items());
  }

  private unitCents(product: Product): number {
    // Convertir antes de multiplicar evita acumular errores de coma flotante.
    return Math.round((product.price + Number.EPSILON) * 100);
  }

  private save(items: CartItem[]): void {
    this.cartItems.set(items);
    this.persist(items);
  }

  private persist(items: CartItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      this.storageError.set('');
    } catch {
      this.storageError.set('No se pudo guardar el carrito en este dispositivo. Reintenta antes de cerrar para conservar tus cambios.');
    }
  }

  private restore(): CartItem[] {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      if (!Array.isArray(raw)) throw new Error('Carrito inválido');
      const restored: CartItem[] = [];
      for (const value of raw) {
        if (!value || typeof value !== 'object') continue;
        const entry = value as Record<string, unknown>;
        const product = this.readProduct(entry['product']);
        const quantity = entry['quantity'];
        if (!product || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1) continue;
        const stock = this.getStockLimit(product);
        if (stock < 1) continue;
        const existing = restored.find((item) => item.product.id === product.id);
        if (existing) {
          existing.quantity = Math.min(existing.quantity + quantity, this.getStockLimit(existing.product));
        } else {
          restored.push({ product, quantity: Math.min(quantity, stock) });
        }
      }
      this.persist(restored);
      return restored;
    } catch {
      this.persist([]);
      return [];
    }
  }

  private readProduct(value: unknown): Product | null {
    if (!value || typeof value !== 'object') return null;
    const product = value as Record<string, unknown>;
    const id = product['id'];
    const price = product['price'];
    const stock = product['stock'];
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 ||
        typeof product['title'] !== 'string' || !product['title'].trim() ||
        typeof product['description'] !== 'string' || typeof product['category'] !== 'string' ||
        typeof price !== 'number' || !Number.isFinite(price) || price < 0 ||
        !Number.isSafeInteger(Math.round(price * 100)) ||
        (stock !== undefined && (typeof stock !== 'number' || !Number.isSafeInteger(stock) || stock < 0))) return null;

    // Persistir sólo los campos del modelo, incluso al restaurar datos externos.
    const result: Product = {
      id, title: product['title'], description: product['description'], category: product['category'], price,
    };
    if (typeof stock === 'number') result.stock = stock;
    if (typeof product['brand'] === 'string') result.brand = product['brand'];
    if (typeof product['thumbnail'] === 'string') result.thumbnail = product['thumbnail'];
    if (Array.isArray(product['images'])) result.images = product['images'].filter((image): image is string => typeof image === 'string');
    for (const key of ['rating', 'discountPercentage'] as const) {
      if (typeof product[key] === 'number' && Number.isFinite(product[key])) result[key] = product[key];
    }
    return result;
  }
}
