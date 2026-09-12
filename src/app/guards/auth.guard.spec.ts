import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { authGuard, guestGuard } from './auth.guard';

describe('Protección de rutas', () => {
  const auth = { isAuthenticated: vi.fn() };
  const router = { createUrlTree: vi.fn((commands: string[]) => commands.join('/')) };
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }, { provide: Router, useValue: router }] }));
  afterEach(() => { vi.clearAllMocks(); TestBed.resetTestingModule(); });

  it('redirige invitados a login y permite ver el formulario', () => {
    auth.isAuthenticated.mockReturnValue(false);
    expect(TestBed.runInInjectionContext(() => authGuard(route, state))).toBe('/login');
    expect(TestBed.runInInjectionContext(() => guestGuard(route, state))).toBe(true);
  });

  it('permite rutas privadas y redirige la página login al catálogo si ya hay sesión', () => {
    auth.isAuthenticated.mockReturnValue(true);
    expect(TestBed.runInInjectionContext(() => authGuard(route, state))).toBe(true);
    expect(TestBed.runInInjectionContext(() => guestGuard(route, state))).toBe('/home');
  });
});
