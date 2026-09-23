import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import axios, { AxiosError } from 'axios';
import api from '../../core/api/axios-client';
import { ApiError } from '../../models/api-error.model';
import { UserInput } from '../../models/user-input.model';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, IonicModule],
})
export class RegisterPage {
  user: UserInput = { username: '', firstName: '', lastName: '', email: '', password: '' };
  isSubmitting = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  // La promesa termina después de registrar en MySQL y navegar al login, o tratar el error.
  async register(): Promise<void> {
    if (this.isSubmitting || this.successMessage) return;
    this.errorMessage = '';
    if (!this.user.username.trim() || !this.user.firstName.trim() || !this.user.lastName.trim()
      || !this.user.email.trim() || (this.user.password?.length ?? 0) < 8) {
      this.errorMessage = 'Completa todos los campos y usa una contraseña de al menos 8 caracteres.';
      return;
    }

    this.isSubmitting = true;
    try {
      const input: UserInput = {
        username: this.user.username.trim(),
        firstName: this.user.firstName.trim(),
        lastName: this.user.lastName.trim(),
        email: this.user.email.trim(),
        password: this.user.password,
      };
      await api.post<User>('/auth/register', input);
      this.successMessage = 'Cuenta creada. Ya puedes iniciar sesión.';
      this.user.password = '';
      await this.router.navigateByUrl('/login?registered=1', { replaceUrl: true });
    } catch (error: unknown) {
      if (axios.isAxiosError<ApiError>(error)) {
        const apiError: AxiosError<ApiError> = error;
        this.errorMessage = apiError.response?.data?.message
          || 'No pudimos registrar tu cuenta. Revisa tu conexión e inténtalo de nuevo.';
      } else {
        this.errorMessage = this.successMessage
          ? 'Usa el enlace Iniciar sesión para continuar.'
          : 'No pudimos registrar tu cuenta. Inténtalo de nuevo.';
      }
    } finally {
      this.isSubmitting = false;
      this.changeDetector.markForCheck();
    }
  }
}
