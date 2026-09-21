import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular/lazy';
import axios from 'axios';
import { AuthService } from '../../services/auth.service';
import { LoginCredentials } from '../../models/auth-request.model';
import { PagePhase } from '../../models/view-state.model';

@Component({ selector: 'app-login', templateUrl: './login.page.html', styleUrls: ['./login.page.scss'], standalone: false })
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);
  readonly phase = signal<PagePhase>('idle');
  readonly loading = computed(() => this.phase() === 'loading');
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    username: ['', [Validators.required, Validators.pattern(/\S/)]],
    password: ['', Validators.required],
  });

  fillDemo(): void {
    const credentials: LoginCredentials = { username: 'emilys', password: 'emilyspass' };
    this.form.setValue(credentials);
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) { this.form.markAllAsTouched(); return; }
    this.phase.set('loading');
    this.error.set('');
    try {
      const credentials: LoginCredentials = this.form.getRawValue();
      await this.auth.login(credentials);
      this.form.reset();
      this.phase.set('success');
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const message = status === 400 || status === 401
        ? 'Usuario o contraseña incorrectos.'
        : 'No pudimos iniciar sesión. Revisa tu conexión e inténtalo nuevamente.';
      this.error.set(message);
      this.phase.set('error');
      const toast = await this.toast.create({ message, duration: 3500, color: 'danger', position: 'top' });
      await toast.present();
    }
  }
}
