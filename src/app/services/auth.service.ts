import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import axios from 'axios';
import api from '../core/api/axios-client';
import { clearSession, readToken, readUser, toUser, TOKEN_KEY, USER_KEY } from '../core/api/session-storage';
import { AuthResponse } from '../models/auth-response.model';
import { LoginCredentials, LoginRequest } from '../models/auth-request.model';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly currentUser = signal(readUser());
  readonly user = this.currentUser.asReadonly();

  async login(credentials: LoginCredentials): Promise<void> {
    const request: LoginRequest = {
      username: credentials.username.trim(), password: credentials.password, expiresInMins: 60,
    };
    const { data } = await api.post<AuthResponse>('/auth/login', request);
    const user = toUser(data);
    try {
      localStorage.setItem(TOKEN_KEY, data.accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (!readToken()) throw new Error('La API devolvió una sesión no válida.');
      this.currentUser.set(user);
    } catch {
      clearSession();
      this.currentUser.set(null);
      throw new Error('No fue posible guardar la sesión en este navegador.');
    }
  }

  async logout(): Promise<void> {
    try {
      if (readToken()) await api.post<void>('/auth/logout');
    } catch { /* Sin conexión se cierra la sesión local; la remota caduca en una hora. */ }
    finally {
      clearSession();
      this.currentUser.set(null);
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    }
  }

  isAuthenticated(): boolean {
    const valid = Boolean(this.getToken() && this.currentUser());
    if (!valid) { clearSession(); this.currentUser.set(null); }
    return valid;
  }

  getToken(): string | null { return readToken(); }

  async getCurrentUser(): Promise<User> {
    try {
      const { data } = await api.get<unknown>('/auth/me');
      const user = toUser(data);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      this.currentUser.set(user);
      return user;
    } catch (error) {
      if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
        await this.logout();
      }
      throw error;
    }
  }
}
