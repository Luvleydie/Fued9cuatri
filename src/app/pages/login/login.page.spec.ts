import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular/lazy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginCredentials } from '../../models/auth-request.model';
import { AuthService } from '../../services/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage: objeto del formulario y fases', () => {
  const auth = { login: vi.fn<(credentials: LoginCredentials) => Promise<void>>() };
  const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
  const toast = { create: vi.fn().mockResolvedValue({ present: vi.fn().mockResolvedValue(undefined) }) };
  let page: LoginPage;

  beforeEach(() => {
    vi.clearAllMocks();
    auth.login.mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [
      FormBuilder, { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router }, { provide: ToastController, useValue: toast },
    ] });
    page = TestBed.runInInjectionContext(() => new LoginPage());
  });
  afterEach(() => TestBed.resetTestingModule());

  it('no envía campos vacíos ni un usuario formado solo por espacios', async () => {
    await page.submit();
    page.form.setValue({ username: '   ', password: 'demo' });
    await page.submit();
    expect(auth.login).not.toHaveBeenCalled();
    expect(page.phase()).toBe('idle');
  });

  it('envía un objeto tipado una sola vez mientras la petición está pendiente', async () => {
    let finish!: () => void;
    auth.login.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    page.fillDemo();
    const request = page.submit();
    expect(page.phase()).toBe('loading');
    await page.submit();
    expect(auth.login).toHaveBeenCalledExactlyOnceWith({ username: 'emilys', password: 'emilyspass' });
    finish();
    await request;
    expect(page.phase()).toBe('success');
    expect(page.form.getRawValue()).toEqual({ username: '', password: '' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home', { replaceUrl: true });
  });

  it('permite reintentar después de credenciales rechazadas', async () => {
    auth.login.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } });
    page.fillDemo();
    await page.submit();
    expect(page.phase()).toBe('error');
    expect(page.loading()).toBe(false);
    expect(page.error()).toBe('Usuario o contraseña incorrectos.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    await page.submit();
    expect(page.phase()).toBe('success');
    expect(page.error()).toBe('');
  });
});
