import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../core/api/session-storage';
import { authGuard, guestGuard } from './auth.guard';

describe('Protección de rutas', () => {
  const router = { createUrlTree: vi.fn((commands: string[]) => commands.join('/')) };
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
  });
  afterEach(() => { vi.clearAllMocks(); TestBed.resetTestingModule(); });

  it('redirige invitados a login y permite ver el formulario', () => {
    expect(TestBed.runInInjectionContext(() => authGuard(route, state))).toBe('/login');
    expect(TestBed.runInInjectionContext(() => guestGuard(route, state))).toBe(true);
  });

  it('permite rutas privadas y redirige login al inicio si ya hay sesión', () => {
    saveSession({ id: 1, username: 'emilys', accessToken: 'a'.repeat(64), expiresAt: Date.now() / 1000 + 3600 });
    expect(TestBed.runInInjectionContext(() => authGuard(route, state))).toBe(true);
    expect(TestBed.runInInjectionContext(() => guestGuard(route, state))).toBe('/home');
  });
});
