import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular/lazy';
import { addIcons } from 'ionicons';
import { bagAddOutline, cubeOutline, star, arrowBackOutline } from 'ionicons/icons';
import { Product, ProductSource } from '../../models/product.model';
import { CartService } from '../../services/cart.service';
import { ProductNotFoundError, ProductsService } from '../../services/products.service';

@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.page.html',
  styleUrls: ['./product-detail.page.scss'],
  standalone: false,
})
export class ProductDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly products = inject(ProductsService);
  private readonly cart = inject(CartService);
  private readonly toastController = inject(ToastController);
  readonly product = signal<Product | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notFound = signal(false);
  readonly source = signal<ProductSource>('api');
  readonly imageFailed = signal(false);

  constructor() {
    addIcons({ bagAddOutline, cubeOutline, star, arrowBackOutline });
  }

  ionViewWillEnter(): void {
    void this.loadProduct();
  }

  async loadProduct(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.notFound.set(false);
    this.product.set(null);
    this.imageFailed.set(false);
    try {
      const result = await this.products.getProduct(this.route.snapshot.paramMap.get('id') ?? '');
      this.product.set(result.product);
      this.source.set(result.source);
    } catch (error) {
      this.notFound.set(error instanceof ProductNotFoundError);
      this.error.set(error instanceof ProductNotFoundError
        ? 'Este producto no existe o ya no está disponible.'
        : 'No pudimos cargar este producto. Revisa tu conexión e intenta otra vez.');
    } finally {
      this.loading.set(false);
    }
  }

  async addProduct(): Promise<void> {
    const product = this.product();
    if (!product) return;
    const added = this.cart.addProduct(product);
    const toast = await this.toastController.create({
      message: added ? 'Producto agregado al carrito.' : 'Ya alcanzaste el stock disponible.',
      duration: 1700,
      color: added ? 'success' : 'warning',
      position: 'top',
    });
    await toast.present();
  }
}
