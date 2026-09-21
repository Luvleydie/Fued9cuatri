import { Component, computed, inject, signal } from '@angular/core';
import { ToastController } from '@ionic/angular/lazy';
import { addIcons } from 'ionicons';
import { bagAddOutline, cubeOutline, star } from 'ionicons/icons';
import { Product, ProductSource } from '../../models/product.model';
import { CartService } from '../../services/cart.service';
import { filterProducts, ProductsService } from '../../services/products.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false,
})
export class HomePage {
  private readonly productsService = inject(ProductsService);
  private readonly cart = inject(CartService);
  private readonly toastController = inject(ToastController);
  readonly products = signal<Product[]>([]);
  readonly query = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly source = signal<ProductSource>('api');
  readonly failedImages = signal<Set<number>>(new Set());
  readonly filteredProducts = computed(() => filterProducts(this.products(), this.query()));

  constructor() {
    addIcons({ bagAddOutline, cubeOutline, star });
  }

  ionViewWillEnter(): void {
    void this.loadProducts();
  }

  async loadProducts(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.failedImages.set(new Set());
    try {
      const result = await this.productsService.getProducts();
      this.products.set(result.products);
      this.source.set(result.source);
    } catch {
      this.error.set('No pudimos cargar los productos. Intenta de nuevo en un momento.');
    } finally {
      this.loading.set(false);
    }
  }

  imageFailed(id: number): void {
    this.failedImages.update((ids) => new Set([...ids, id]));
  }

  async addProduct(product: Product): Promise<void> {
    const added = this.cart.addProduct(product);
    const toast = await this.toastController.create({
      message: added ? 'Producto agregado al carrito.' : 'Ya alcanzaste el stock disponible.',
      duration: 1700,
      position: 'top',
      color: added ? 'success' : 'warning',
    });
    await toast.present();
  }
}
