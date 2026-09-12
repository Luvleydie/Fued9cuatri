import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular/lazy';
import axios from 'axios';
import { AuthService } from '../../services/auth.service';

@Component({ selector: 'app-login', templateUrl: './login.page.html', styleUrls: ['./login.page.scss'], standalone: false })
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    username: ['', [Validators.required, Validators.pattern(/\S/)]],
    password: ['', Validators.required],
  });

  fillDemo(): void { this.form.setValue({ username: 'emilys', password: 'emilyspass' }); }

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');
    try {
      const { username, password } = this.form.getRawValue();
      await this.auth.login(username, password);
      this.form.reset();
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const message = status === 400 || status === 401
        ? 'Usuario o contraseña incorrectos.'
        : 'No pudimos iniciar sesión. Revisa tu conexión e inténtalo nuevamente.';
      this.error.set(message);
      const toast = await this.toast.create({ message, duration: 3500, color: 'danger', position: 'top' });
      await toast.present();
    } finally { this.loading.set(false); }
  }
}
