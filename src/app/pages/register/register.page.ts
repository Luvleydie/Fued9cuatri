import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import { Subscription } from 'rxjs';
import api from '../../core/api/axios-client';
import { ConnectionNoticeComponent } from '../../core/connection-notice.component';
import { connectionState } from '../../core/api/connection-state';
import { getErrorMessage } from '../../core/api/api-errors';
import { User } from '../../models/user.model';
import { applyServerErrors, bindFormChanges, createUserForm, getFieldError, userInputFromForm } from '../../core/forms/form-models';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, IonicModule, ConnectionNoticeComponent],
})
export class RegisterPage implements OnDestroy {
  readonly registerForm = createUserForm('create');
  submitted = false;
  isSubmitting = false;
  errorMessage = '';
  successMessage = '';
  readonly connection = connectionState;
  private readonly formChanges: Subscription;

  constructor(
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.formChanges = bindFormChanges(this.registerForm, () => this.changeDetector.markForCheck());
  }

  fieldError(field: keyof RegisterPage['registerForm']['controls']): string {
    return getFieldError(this.registerForm, field, this.submitted);
  }

  // La promesa termina después de registrar en MySQL y navegar al login, o tratar el error.
  async register(): Promise<void> {
    if (this.isSubmitting || this.successMessage || this.connection.offline()) return;
    this.errorMessage = '';
    this.submitted = true;
    if (this.registerForm.invalid || this.registerForm.pending || this.registerForm.disabled) {
      this.registerForm.markAllAsTouched();
      this.errorMessage = 'Completa todos los campos y usa una contraseña de al menos 8 caracteres.';
      return;
    }

    const input = userInputFromForm(this.registerForm);
    this.isSubmitting = true;
    this.registerForm.disable({ emitEvent: false });
    let submissionError: unknown;
    try {
      await api.post<User>('/auth/register', input);
      this.successMessage = 'Cuenta creada. Ya puedes iniciar sesión.';
      this.registerForm.controls.password.reset('', { emitEvent: false });
      this.registerForm.controls.confirmPassword.reset('', { emitEvent: false });
      this.submitted = false;
      const navigated = await this.router.navigateByUrl('/login?registered=1', { replaceUrl: true });
      if (!navigated) this.errorMessage = 'Usa el enlace Iniciar sesión para continuar.';
    } catch (error: unknown) {
      if (!this.successMessage) submissionError = error;
      this.errorMessage = this.successMessage
        ? 'Usa el enlace Iniciar sesión para continuar.'
        : getErrorMessage(error, 'No pudimos registrar tu cuenta. Inténtalo de nuevo.', true);
    } finally {
      this.isSubmitting = false;
      this.registerForm.enable({ emitEvent: false });
      applyServerErrors(this.registerForm, submissionError);
      this.changeDetector.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.formChanges.unsubscribe();
  }
}
