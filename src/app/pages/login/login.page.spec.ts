import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { AxiosError, AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../core/api/axios-client';
import { clearSession, readToken, readUser, saveSession } from '../../core/api/session-storage';
import { AuthResponse } from '../../models/auth-response.model';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  const response: AuthResponse = {
    id: 1,
    username: 'emilys',
    accessToken: 'a'.repeat(64),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
  const changeDetector = { markForCheck: vi.fn() };
  let page: LoginPage;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    clearSession();
    router.navigateByUrl.mockResolvedValue(true);
    vi.spyOn(api, 'post').mockResolvedValue({ data: response } as AxiosResponse<AuthResponse>);
    page = new LoginPage(
      router as unknown as Router,
      changeDetector as unknown as ChangeDetectorRef,
      { snapshot: { queryParamMap: convertToParamMap({ registered: '1' }) } } as ActivatedRoute,
    );
  });

  afterEach(() => {
    page.ngOnDestroy();
    clearSession();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rechaza campos vacíos sin enviar una petición', async () => {
    page.credentials = { username: '  ', password: 'secreto' };
    await page.login();
    expect(api.post).not.toHaveBeenCalled();
    expect(page.errorMessage).toContain('Escribe tu usuario');
    expect(page.isSubmitting).toBe(false);
  });

  it('envía las credenciales, guarda la sesión y reemplaza la ruta de login', async () => {
    page.credentials = { username: ' emilys ', password: 'emilyspass' };
    await page.login();
    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'emilys', password: 'emilyspass' });
    expect(readToken()).toBe(response.accessToken);
    expect(readUser()).toEqual({ id: 1, username: 'emilys' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home', { replaceUrl: true });
    expect(page.credentials.password).toBe('');
    expect(page.registrationSuccess).toBe(true);
    expect(page.isSubmitting).toBe(false);
  });

  it('bloquea un segundo envío mientras espera la respuesta', async () => {
    let resolveRequest!: (value: AxiosResponse<AuthResponse>) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
    page.fillDemo();
    const request = page.login();
    expect(page.isSubmitting).toBe(true);
    await page.login();
    expect(api.post).toHaveBeenCalledTimes(1);
    resolveRequest({ data: response } as AxiosResponse<AuthResponse>);
    await request;
    expect(page.isSubmitting).toBe(false);
  });

  it('muestra el error de la API y termina la animación después de 500 ms', async () => {
    saveSession(response);
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: { status: 401, data: { message: 'Usuario o contraseña incorrectos.' } } });
    page.fillDemo();
    await page.login();
    expect(page.errorMessage).toBe('Usuario o contraseña incorrectos.');
    expect(page.failLogin).toBe(true);
    expect(page.timer).toHaveLength(1);
    expect(readToken()).toBeNull();
    expect(readUser()).toBeNull();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(page.failLogin).toBe(false);
    expect(changeDetector.markForCheck).toHaveBeenCalled();
  });

  it('permite reintentar después de un timeout y limpia el error anterior', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new AxiosError('Timeout', 'ECONNABORTED'));
    page.fillDemo();
    await page.login();
    expect(page.errorMessage).toContain('Revisa tu conexión');
    expect(page.isSubmitting).toBe(false);
    await page.login();
    expect(page.errorMessage).toBe('');
    expect(page.failLogin).toBe(false);
    expect(page.timer).toEqual([]);
    expect(readToken()).toBe(response.accessToken);
  });

  it('borra la sesión si el router rechaza la navegación', async () => {
    router.navigateByUrl.mockResolvedValueOnce(false);
    page.fillDemo();
    await page.login();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home', { replaceUrl: true });
    expect(readToken()).toBeNull();
    expect(readUser()).toBeNull();
    expect(page.errorMessage).toContain('No pudimos completar');
    expect(page.failLogin).toBe(true);
    expect(page.isSubmitting).toBe(false);
  });

  it('cancela los temporizadores al destruir la página', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new AxiosError('Sin conexión'));
    page.fillDemo();
    await page.login();
    page.ngOnDestroy();
    expect(page.timer).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
