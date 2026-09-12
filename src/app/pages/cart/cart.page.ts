import { Component, inject, signal } from '@angular/core';
import { AlertController } from '@ionic/angular/lazy';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, bagHandleOutline, lockClosedOutline, trashOutline } from 'ionicons/icons';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-cart',
  templateUrl: './cart.page.html',
  styleUrls: ['./cart.page.scss'],
  standalone: false,
})
export class CartPage {
  readonly cart = inject(CartService);
  readonly dialogOpen = signal(false);
  private readonly alerts = inject(AlertController);

  constructor() {
    addIcons({ arrowForwardOutline, bagHandleOutline, lockClosedOutline, trashOutline });
  }

  async confirmClear(): Promise<void> {
    if (this.dialogOpen() || !this.cart.getTotalItems()) return;
    this.dialogOpen.set(true);
    try {
      const alert = await this.alerts.create({
        header: '¿Vaciar carrito?',
        message: 'Se eliminarán todos los productos de tu carrito.',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Vaciar carrito', role: 'destructive', handler: () => this.cart.clearCart() },
        ],
      });
      await alert.present();
      await alert.onDidDismiss();
    } finally {
      this.dialogOpen.set(false);
    }
  }

  async checkout(): Promise<void> {
    if (this.dialogOpen() || !this.cart.getTotalItems()) return;
    this.dialogOpen.set(true);
    try {
      const total = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(this.cart.getTotal());
      const alert = await this.alerts.create({
        header: '¡Compra simulada correctamente!',
        message: `Tu selección suma ${total} USD. Esta es una demostración; no se realizó ningún cobro.`,
        backdropDismiss: false,
        buttons: [{ text: 'Aceptar', handler: () => this.cart.clearCart() }],
      });
      await alert.present();
      await alert.onDidDismiss();
    } finally {
      this.dialogOpen.set(false);
    }
  }

  imageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    image.onerror = null;
    image.src = 'assets/products/product-placeholder.svg';
  }
}
