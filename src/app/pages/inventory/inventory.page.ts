import { Component, computed, inject, signal } from '@angular/core';
import { AlertController } from '@ionic/angular/lazy';
import axios from 'axios';
import { addIcons } from 'ionicons';
import { addOutline, createOutline, cubeOutline, refreshOutline, trashOutline } from 'ionicons/icons';
import { ApiError } from '../../models/api-error.model';
import { Product } from '../../models/product.model';
import { ProductInput } from '../../models/product-input.model';
import { PagePhase } from '../../models/view-state.model';
import { AuthService } from '../../services/auth.service';
import { filterProducts, ProductsService } from '../../services/products.service';
import { emptyProductInput, normalizeProductInput, ProductFormErrors, validateProductInput } from './product-form';

@Component({
  selector: 'app-inventory',
  templateUrl: './inventory.page.html',
  styleUrls: ['./inventory.page.scss'],
  standalone: false,
})
export class InventoryPage {
  private readonly productsService = inject(ProductsService);
  private readonly alerts = inject(AlertController);
  private readonly auth = inject(AuthService);
  readonly products = signal<Product[]>([]);
  readonly query = signal('');
  readonly phase = signal<PagePhase>('idle');
  readonly error = signal('');
  readonly message = signal('');
  readonly formOpen = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly fieldErrors = signal<ProductFormErrors>({});
  readonly dialogOpen = signal(false);
  readonly busy = computed(() => this.phase() === 'loading' || this.phase() === 'saving' || this.dialogOpen());
  readonly filteredProducts = computed(() => filterProducts(this.products(), this.query()));
  form: ProductInput = emptyProductInput();

  constructor() {
    addIcons({ addOutline, createOutline, cubeOutline, refreshOutline, trashOutline });
  }

  ionViewWillEnter(): void {
    if (!this.busy()) void this.loadInventory();
  }

  async loadInventory(): Promise<void> {
    if (this.busy()) return;
    this.phase.set('loading');
    this.error.set('');
    this.message.set('');
    try {
      this.products.set(await this.productsService.getInventory());
      this.phase.set('idle');
    } catch (error) {
      await this.setError(error, 'No se pudo cargar el inventario. Revisa la conexión e inténtalo de nuevo.');
    }
  }

  startCreate(): void {
    if (this.busy()) return;
    this.editingId.set(null);
    this.form = emptyProductInput();
    this.openForm();
  }

  startEdit(product: Product): void {
    if (this.busy()) return;
    this.editingId.set(product.id);
    this.form = {
      title: product.title, description: product.description, category: product.category,
      price: product.price, stock: product.stock ?? 0, brand: product.brand ?? '', thumbnail: product.thumbnail ?? '',
    };
    this.openForm();
  }

  cancelEdit(): void {
    if (this.busy()) return;
    this.formOpen.set(false);
    this.editingId.set(null);
    this.form = emptyProductInput();
    this.fieldErrors.set({});
    this.error.set('');
    this.phase.set('idle');
  }

  async saveProduct(): Promise<void> {
    if (this.busy() || !this.formOpen()) return;
    const input: ProductInput = normalizeProductInput(this.form);
    const errors = validateProductInput(input);
    this.fieldErrors.set(errors);
    this.message.set('');
    this.error.set('');
    if (Object.keys(errors).length) {
      this.phase.set('error');
      this.error.set('Revisa los campos indicados antes de guardar.');
      return;
    }
    this.phase.set('saving');
    const id = this.editingId();
    try {
      const saved: Product = id === null
        ? await this.productsService.createProduct(input)
        : await this.productsService.updateProduct(id, input);
      this.products.update(products => id === null ? [...products, saved] : products.map(product => product.id === id ? saved : product));
      this.formOpen.set(false);
      this.editingId.set(null);
      this.form = emptyProductInput();
      this.query.set('');
      this.phase.set('success');
      this.message.set(id === null ? 'Producto creado correctamente.' : 'Cambios guardados correctamente.');
    } catch (error) {
      if (axios.isAxiosError<ApiError>(error) && error.response?.data.errors) this.fieldErrors.set(error.response.data.errors);
      await this.setError(error, 'No se pudo guardar el producto. Los cambios siguen en el formulario para que puedas reintentar.');
    }
  }

  async confirmDelete(product: Product): Promise<void> {
    if (this.busy()) return;
    this.dialogOpen.set(true);
    try {
      const alert = await this.alerts.create({
        header: '¿Eliminar producto?',
        message: 'Este producto se eliminará del catálogo. Esta acción no se puede deshacer.',
        buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Eliminar', role: 'destructive' }],
      });
      await alert.present();
      const result = await alert.onDidDismiss();
      this.dialogOpen.set(false);
      if (result.role === 'destructive') await this.deleteProduct(product);
    } finally {
      this.dialogOpen.set(false);
    }
  }

  private async deleteProduct(product: Product): Promise<void> {
    if (this.busy()) return;
    this.phase.set('saving');
    this.error.set('');
    this.message.set('');
    try {
      await this.productsService.deleteProduct(product.id);
      this.products.update(products => products.filter(item => item.id !== product.id));
      if (this.editingId() === product.id) {
        this.formOpen.set(false);
        this.editingId.set(null);
        this.form = emptyProductInput();
      }
      this.phase.set('success');
      this.message.set('Producto eliminado correctamente.');
    } catch (error) {
      await this.setError(error, 'No se pudo eliminar el producto. Inténtalo de nuevo.');
    }
  }

  private openForm(): void {
    this.fieldErrors.set({});
    this.error.set('');
    this.message.set('');
    this.phase.set('idle');
    this.formOpen.set(true);
  }

  private async setError(error: unknown, fallback: string): Promise<void> {
    const apiMessage = axios.isAxiosError<ApiError>(error) ? error.response?.data.message : undefined;
    this.error.set(typeof apiMessage === 'string' ? apiMessage : fallback);
    this.phase.set('error');
    if (axios.isAxiosError(error) && error.response?.status === 401) await this.auth.logout();
  }
}
