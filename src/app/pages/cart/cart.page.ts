import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import axios from 'axios';
import { clearSession } from '../../core/api/session-storage';
import { ConnectionNoticeComponent } from '../../core/connection-notice.component';
import { connectionState } from '../../core/api/connection-state';
import { getErrorMessage, isRecoverableReadError } from '../../core/api/api-errors';
import { CachedResult, DataValidationError } from '../../core/api/data-cache';
import { cacheNotice } from '../../core/cache-notice';
import { CartItem, CartResponse } from '../../models/cart-item.model';
import { Product } from '../../models/product.model';
import { CartService } from '../../services/cart.service';

type QuantityGroup = FormGroup<{ productId: FormControl<number>; quantity: FormControl<number | null> }>;

@Component({
  selector: 'app-cart',
  templateUrl: './cart.page.html',
  standalone: true,
  imports: [CommonModule, RouterModule, IonicModule, ReactiveFormsModule, ConnectionNoticeComponent],
})
export class CartPage {
  products: Product[] = [];
  items: CartItem[] = [];
  total = 0;
  isLoading = false;
  isSubmitting = false;
  errorMessage = '';
  readonly connection = connectionState;
  productsSnapshot: CachedResult<Product[]> | null = null;
  cartSnapshot: CachedResult<CartResponse> | null = null;
  needsRefresh = false;
  readonly quantityForm = new FormGroup({ items: new FormArray<QuantityGroup>([]) });

  get quantityRows(): FormArray<QuantityGroup> { return this.quantityForm.controls.items; }

  get readOnly(): boolean {
    return this.connection.offline() || this.needsRefresh || !this.cartSnapshot || !this.productsSnapshot
      || this.cartSnapshot.source === 'cache' || this.productsSnapshot.source === 'cache';
  }
  get productsNotice(): string { return cacheNotice(this.productsSnapshot, this.connection.offline()); }
  get cartNotice(): string { return cacheNotice(this.cartSnapshot, this.connection.offline()); }

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
      const [products, cart] = await Promise.allSettled([this.cartService.getProducts(), this.cartService.getCart()]);
      if (products.status === 'fulfilled') {
        this.productsSnapshot = products.value;
        this.products = products.value.data;
      } else {
        this.productsSnapshot = null;
        this.products = [];
      }
      if (cart.status === 'fulfilled') {
        this.cartSnapshot = cart.value;
        this.setCart(cart.value.data);
      } else {
        this.cartSnapshot = null;
        this.setCart({ items: [], total: 0 });
      }
      this.needsRefresh = false;
      const failures = [products, cart].filter(result => result.status === 'rejected');
      // Una sesión rechazada tiene prioridad sobre un fallo de la otra consulta.
      const failure = failures.find(result => axios.isAxiosError(result.reason) && result.reason.response?.status === 401) ?? failures[0];
      if (failure) await this.handleError(failure.reason);
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

  // Cada artículo recibido crea su propio grupo de controles dentro del FormArray.
  setCart(cart: CartResponse, preserveDrafts = false, confirmedProductId?: number): void {
    const previous = new Map(this.quantityRows.controls.map(group => [group.controls.productId.value, group]));
    this.items = cart.items;
    this.total = cart.total;
    const rows = cart.items.map(item => {
      const old = previous.get(item.productId);
      const keep = preserveDrafts && old?.dirty && item.productId !== confirmedProductId;
      const quantity = new FormControl<number | null>(keep ? old.controls.quantity.value : item.quantity, {
        validators: [Validators.required, Validators.min(1), Validators.max(Math.min(item.stock, 99)),
          control => Number.isInteger(control.value) ? null : { integer: true }],
      });
      const group = new FormGroup({ productId: new FormControl(item.productId, { nonNullable: true }), quantity });
      if (keep) {
        quantity.markAsDirty();
        if (old.controls.quantity.touched) quantity.markAsTouched();
      }
      return group;
    });
    this.quantityForm.setControl('items', new FormArray(rows));
  }

  quantityError(index: number): string {
    const control = this.quantityRows.at(index)?.controls.quantity;
    if (!control || (!control.touched && !control.dirty)) return '';
    if (control.hasError('required')) return 'Escribe la cantidad que deseas guardar.';
    if (control.hasError('integer')) return 'La cantidad debe ser un número entero.';
    if (control.hasError('min')) return 'La cantidad mínima es 1. Para eliminar el artículo, pulsa Quitar.';
    if (control.hasError('max')) return `La cantidad máxima es ${Math.min(this.items[index].stock, 99)} según las existencias.`;
    return '';
  }

  async saveQuantity(index: number): Promise<void> {
    const group = this.quantityRows.at(index);
    if (!group || this.isLoading || this.isSubmitting || this.readOnly) return;
    group.markAllAsTouched();
    if (group.invalid || group.pending) return;
    const { productId, quantity } = group.getRawValue();
    if (quantity === null || quantity === this.quantityOf(productId)) return;
    await this.setQuantity(productId, quantity);
  }

  async setQuantity(productId: number, quantity: number): Promise<void> {
    if (this.isSubmitting || this.isLoading || this.readOnly) return;
    const product = this.products.find(item => item.id === productId);
    if (!product || !Number.isInteger(quantity) || quantity < 0 || quantity > Math.min(product.stock, 99)) {
      this.errorMessage = 'Revisa la cantidad y las existencias antes de guardar.';
      return;
    }
    this.isSubmitting = true;
    this.errorMessage = '';
    try {
      const cart = quantity === 0
        ? await this.cartService.removeItem(productId)
        : await this.cartService.setQuantity(productId, quantity);
      this.setCart(cart, true, productId);
      if (this.cartSnapshot) this.cartSnapshot = { ...this.cartSnapshot, data: cart, source: 'network', savedAt: Date.now() };
    } catch (error: unknown) {
      this.needsRefresh = isRecoverableReadError(error) || error instanceof DataValidationError;
      await this.handleError(error, true);
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  private async handleError(error: unknown, mutation = false): Promise<void> {
    this.errorMessage = getErrorMessage(error, 'No se pudo guardar o cargar el carrito. Intenta de nuevo.', mutation);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        clearSession();
        this.items = [];
        this.products = [];
        this.total = 0;
        this.quantityRows.clear();
        this.productsSnapshot = null;
        this.cartSnapshot = null;
        await this.router.navigateByUrl('/login?expired=1', { replaceUrl: true });
      }
    }
  }
}
