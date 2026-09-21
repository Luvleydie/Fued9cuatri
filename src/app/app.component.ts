import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { addIcons } from 'ionicons';
import { gridOutline, bagHandleOutline, personOutline, logOutOutline, shieldCheckmarkOutline, createOutline } from 'ionicons/icons';
import { AuthService } from './services/auth.service';
import { CartService } from './services/cart.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly cart = inject(CartService);
  readonly currentUrl = signal(this.router.url);
  readonly showNavigation = computed(() => Boolean(this.auth.user()) && !this.currentUrl().startsWith('/login'));

  constructor() {
    addIcons({ gridOutline, bagHandleOutline, personOutline, logOutOutline, shieldCheckmarkOutline, createOutline });
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) this.currentUrl.set(event.urlAfterRedirects);
    });
  }
}
