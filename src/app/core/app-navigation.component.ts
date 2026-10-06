import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [RouterModule, IonicModule],
  template: `
    <ion-header class="app-header">
      <aside class="app-sidebar">
        <a class="navigation-brand" routerLink="/home" aria-label="NovaCart, inicio">
          <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14l1 14H4L5 7Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 9V6a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
          <span>NovaCart<small>Tu espacio, organizado.</small></span>
        </a>
        <p class="navigation-caption">TU ESPACIO</p>
        <nav class="navigation-links" aria-label="Navegación principal">
          <a routerLink="/home" [class.active]="activePage === 'home'" [attr.aria-current]="activePage === 'home' ? 'page' : null">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/></svg>
            Usuarios
          </a>
          <a routerLink="/cart" [class.active]="activePage === 'cart'" [attr.aria-current]="activePage === 'cart' ? 'page' : null" aria-label="Carrito">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 3h2l3 12h11l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>
            <span>Carrito</span>
            @if (cartCount > 0) { <span class="navigation-count" aria-hidden="true">{{ cartCount }}</span> }
          </a>
        </nav>
        <div class="navigation-note"><span class="navigation-note-icon" aria-hidden="true">✦</span><p>Todo en su lugar.<small>Administra tus usuarios y guarda tus artículos favoritos.</small></p></div>
        <div class="navigation-footer"><span class="status-dot" aria-hidden="true"></span> NovaCart · 1.0</div>
      </aside>
      <ion-toolbar>
        <div class="app-topbar">
          <div class="topbar-location"><span>Mi espacio</span><span aria-hidden="true">/</span><strong>{{ activePage === 'home' ? 'Usuarios' : 'Carrito' }}</strong></div>
          <div class="topbar-account">
            <span class="topbar-avatar" aria-hidden="true">{{ username.slice(0, 1).toUpperCase() || 'N' }}</span>
            <span class="topbar-username">{{ username }}</span>
            <button class="text-button logout-button" type="button" (click)="logout.emit()" [disabled]="busy" aria-label="Cerrar sesión">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9"/></svg><span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </ion-toolbar>
    </ion-header>
  `,
})
export class AppNavigationComponent {
  @Input() activePage: 'home' | 'cart' = 'home';
  @Input() username = '';
  @Input() cartCount = 0;
  @Input() busy = false;
  @Output() readonly logout = new EventEmitter<void>();
}
