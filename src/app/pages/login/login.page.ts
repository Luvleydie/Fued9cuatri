import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import { Subscription } from 'rxjs';
import api from '../../core/api/axios-client';
import { clearSession, saveSession } from '../../core/api/session-storage';
import { ConnectionNoticeComponent } from '../../core/connection-notice.component';
import { connectionState } from '../../core/api/connection-state';
import { getErrorMessage } from '../../core/api/api-errors';
import { LoginCredentials } from '../../models/auth-request.model';
import { AuthResponse } from '../../models/auth-response.model';
import { applyServerErrors, bindFormChanges, createLoginForm, getFieldError } from '../../core/forms/form-models';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, IonicModule, ConnectionNoticeComponent],
})
export class LoginPage implements OnDestroy {
  readonly loginForm = createLoginForm();
  submitted = false;
  isSubmitting = false;
  failLogin = false;
  errorMessage = '';
  passwordVisible = false;
  readonly connection = connectionState;
  timer: ReturnType<typeof setTimeout>[] = [];
  private readonly formChanges: Subscription;

  constructor(
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
  ) {
    this.formChanges = bindFormChanges(this.loginForm, () => this.changeDetector.markForCheck());
  }

  get registrationSuccess(): boolean {
    return this.route.snapshot.queryParamMap.get('registered') === '1';
  }

  get passwordUpdated(): boolean {
    return this.route.snapshot.queryParamMap.get('updated') === '1';
  }

  get sessionExpired(): boolean {
    return this.route.snapshot.queryParamMap.get('expired') === '1';
  }

  fillDemo(): void {
    if (this.isSubmitting) return;
    this.clearTimers();
    this.failLogin = false;
    this.errorMessage = '';
    this.submitted = false;
    this.loginForm.reset({ username: 'emilys', password: 'emilyspass' });
  }

  togglePasswordVisibility(): void {
    if (!this.isSubmitting) this.passwordVisible = !this.passwordVisible;
  }

  fieldError(field: 'username' | 'password'): string {
    return getFieldError(this.loginForm, field, this.submitted);
  }

  // async crea una promesa; void indica que el formulario no recibe un dato de retorno.
  async login(): Promise<void> {
    if (this.isSubmitting || this.connection.offline()) return;
    this.clearTimers();
    this.failLogin = false;
    this.errorMessage = '';
    this.submitted = true;
    if (this.loginForm.invalid || this.loginForm.pending || this.loginForm.disabled) {
      this.loginForm.markAllAsTouched();
      this.errorMessage = 'Escribe tu usuario y contraseña.';
      return;
    }

    const values = this.loginForm.getRawValue();
    const credentials: LoginCredentials = { username: values.username.trim(), password: values.password };
    this.isSubmitting = true;
    this.loginForm.disable({ emitEvent: false });
    let submissionError: unknown;
    try {
      // Axios devuelve una promesa. await espera la respuesta; data contiene el JSON de PHP.
      const { data } = await api.post<AuthResponse>('/auth/login', credentials);
      saveSession(data);
      const navigated = await this.router.navigateByUrl('/home', { replaceUrl: true });
      if (!navigated) throw new Error('No pudimos abrir la página principal. Inténtalo de nuevo.');
      this.loginForm.controls.password.reset('', { emitEvent: false });
      this.passwordVisible = false;
      this.submitted = false;
    } catch (error: unknown) {
      submissionError = error;
      clearSession();
      this.errorMessage = getErrorMessage(error, 'No pudimos completar el inicio de sesión. Inténtalo de nuevo.');
      this.failLogin = true;
      this.timer.push(setTimeout(() => {
        this.failLogin = false;
        this.changeDetector.markForCheck();
      }, 500));
    } finally {
      this.isSubmitting = false;
      this.loginForm.enable({ emitEvent: false });
      applyServerErrors(this.loginForm, submissionError);
      this.changeDetector.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.formChanges.unsubscribe();
  }

  private clearTimers(): void {
    this.timer.forEach((timer) => clearTimeout(timer));
    this.timer = [];
  }
}
