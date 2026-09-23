import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import axios, { AxiosError } from 'axios';
import api from '../../core/api/axios-client';
import { clearSession, saveSession } from '../../core/api/session-storage';
import { ApiError } from '../../models/api-error.model';
import { LoginCredentials } from '../../models/auth-request.model';
import { AuthResponse } from '../../models/auth-response.model';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, IonicModule],
})
export class LoginPage implements OnDestroy {
  credentials: LoginCredentials = { username: '', password: '' };
  isSubmitting = false;
  failLogin = false;
  errorMessage = '';
  timer: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
  ) {}

  get registrationSuccess(): boolean {
    return this.route.snapshot.queryParamMap.get('registered') === '1';
  }

  get passwordUpdated(): boolean {
    return this.route.snapshot.queryParamMap.get('updated') === '1';
  }

  fillDemo(): void {
    this.credentials = { username: 'emilys', password: 'emilyspass' };
  }

  async login(): Promise<void> {
    if (this.isSubmitting) return;
    this.clearTimers();
    this.failLogin = false;
    this.errorMessage = '';
    if (!this.credentials.username.trim() || !this.credentials.password) {
      this.errorMessage = 'Escribe tu usuario y contraseña.';
      return;
    }

    this.isSubmitting = true;
    try {
      const credentials: LoginCredentials = {
        username: this.credentials.username.trim(),
        password: this.credentials.password,
      };
      const { data } = await api.post<AuthResponse>('/auth/login', credentials);
      saveSession(data);
      const navigated = await this.router.navigateByUrl('/home', { replaceUrl: true });
      if (!navigated) throw new Error('No pudimos abrir la página principal. Inténtalo de nuevo.');
      this.credentials.password = '';
    } catch (error: unknown) {
      clearSession();
      if (axios.isAxiosError<ApiError>(error)) {
        const apiError: AxiosError<ApiError> = error;
        this.errorMessage = apiError.response?.data?.message
          || 'No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.';
      } else {
        this.errorMessage = 'No pudimos completar el inicio de sesión. Inténtalo de nuevo.';
      }
      this.failLogin = true;
      this.timer.push(setTimeout(() => {
        this.failLogin = false;
        this.changeDetector.markForCheck();
      }, 500));
    } finally {
      this.isSubmitting = false;
      this.changeDetector.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    this.timer.forEach((timer) => clearTimeout(timer));
    this.timer = [];
  }
}
