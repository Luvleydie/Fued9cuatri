import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import axios, { AxiosError } from 'axios';
import { clearSession } from '../../core/api/session-storage';
import { ApiError } from '../../models/api-error.model';
import { CartItem, CartResponse } from '../../models/cart-item.model';
import { Product } from '../../models/product.model';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-cart',
  templateUrl: './cart.page.html',
  standalone: true,
  imports: [CommonModule, RouterModule, IonicModule],
})
export class CartPage {
  products: Product[] = [];
  items: CartItem[] = [];
  total = 0;
  isLoading = false;
  isSubmitting = false;
  errorMessage = '';

  constructor(private cartService: CartService, private router: Router, private cdr: ChangeDetectorRef) {}

  ionViewWillEnter(): void {
    void this.loadCart();
  }

  async loadCart(): Promise<void> {
    if (this.isLoading || this.isSubmitting) return;
    this.isLoading = true;
    this.errorMessage = '';
    try {
      // Las dos consultas son independientes: empiezan juntas y esperamos ambas respuestas.
      const [products, cart] = await Promise.all([this.cartService.getProducts(), this.cartService.getCart()]);
      this.products = products;
      this.setCart(cart);
    } catch (error: unknown) {
      await this.handleError(error);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  quantityOf(productId: number): number {
    return this.items.find(item => item.productId === productId)?.quantity ?? 0;
  }

  // Asignación inmediata en memoria: aquí no hace falta async ni Promise.
  // La interfaz CartResponse describe la forma de los datos que recibimos.
  setCart(cart: CartResponse): void {
    this.items = cart.items;
    this.total = cart.total;
  }

  async setQuantity(productId: number, quantity: number): Promise<void> {
    if (this.isSubmitting || this.isLoading) return;
    this.isSubmitting = true;
    this.errorMessage = '';
    try {
      const cart = quantity === 0
        ? await this.cartService.removeItem(productId)
        : await this.cartService.setQuantity(productId, quantity);
      this.setCart(cart);
    } catch (error: unknown) {
      await this.handleError(error);
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  private async handleError(error: unknown): Promise<void> {
    this.errorMessage = 'No se pudo guardar o cargar el carrito. Intenta de nuevo.';
    if (axios.isAxiosError<ApiError>(error)) {
      const requestError: AxiosError<ApiError> = error;
      this.errorMessage = requestError.response?.data?.message || this.errorMessage;
      if (requestError.response?.status === 401) {
        clearSession();
        this.items = [];
        this.products = [];
        this.total = 0;
        await this.router.navigateByUrl('/login', { replaceUrl: true });
      }
    }
  }
}
