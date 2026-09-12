import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({ selector: 'app-profile', templateUrl: './profile.page.html', styleUrls: ['./profile.page.scss'], standalone: false })
export class ProfilePage {
  readonly auth = inject(AuthService);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly imageFailed = signal(false);

  ionViewWillEnter(): void { void this.loadProfile(); }

  async loadProfile(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try { await this.auth.getCurrentUser(); }
    catch { this.error.set('No pudimos actualizar tu perfil. Revisa tu conexión e inténtalo nuevamente.'); }
    finally { this.loading.set(false); }
  }
}
