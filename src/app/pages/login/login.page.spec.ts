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
    window.dispatchEvent(new Event('online'));
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
    window.dispatchEvent(new Event('online'));
    clearSession();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rechaza campos vacíos sin enviar una petición', async () => {
    page.loginForm.setValue({ username: '  ', password: 'secreto' });
    await page.login();
    expect(api.post).not.toHaveBeenCalled();
    expect(page.errorMessage).toContain('Escribe tu usuario');
    expect(page.isSubmitting).toBe(false);
    expect(page.loginForm.controls.username.touched).toBe(true);
    expect(page.fieldError('username')).not.toBe('');
  });

  it('envía las credenciales, guarda la sesión y reemplaza la ruta de login', async () => {
    page.loginForm.setValue({ username: ' emilys ', password: 'emilyspass' });
    await page.login();
    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'emilys', password: 'emilyspass' });
    expect(readToken()).toBe(response.accessToken);
    expect(readUser()).toEqual({ id: 1, username: 'emilys' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home', { replaceUrl: true });
    expect(page.loginForm.controls.password.value).toBe('');
    expect(page.registrationSuccess).toBe(true);
    expect(page.isSubmitting).toBe(false);
  });

  it('bloquea un segundo envío mientras espera la respuesta', async () => {
    let resolveRequest!: (value: AxiosResponse<AuthResponse>) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
    page.fillDemo();
    const request = page.login();
    expect(page.isSubmitting).toBe(true);
    expect(page.loginForm.disabled).toBe(true);
    await page.login();
    expect(api.post).toHaveBeenCalledTimes(1);
    resolveRequest({ data: response } as AxiosResponse<AuthResponse>);
    await request;
    expect(page.isSubmitting).toBe(false);
    expect(page.loginForm.enabled).toBe(true);
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
    expect(page.loginForm.enabled).toBe(true);
    await page.login();
    expect(page.errorMessage).toBe('');
    expect(page.failLogin).toBe(false);
    expect(page.timer).toEqual([]);
    expect(readToken()).toBe(response.accessToken);
  });

  it('limpia el rechazo anterior y los errores de campo al cargar la cuenta demo', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: {
      status: 422, data: { message: 'Revisa el usuario.', errors: { username: 'Este usuario no está disponible.' } },
    } });
    page.fillDemo();
    await page.login();
    expect(page.loginForm.invalid).toBe(true);
    expect(page.errorMessage).toBe('Revisa el usuario.');
    expect(page.failLogin).toBe(true);
    page.fillDemo();
    expect(page.loginForm.getRawValue()).toEqual({ username: 'emilys', password: 'emilyspass' });
    expect(page.loginForm.valid).toBe(true);
    expect(page.errorMessage).toBe('');
    expect(page.fieldError('username')).toBe('');
    expect(page.failLogin).toBe(false);
    expect(page.submitted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('permite revisar la contraseña sin cambiarla y bloquea el control durante el envío', async () => {
    page.fillDemo();
    page.togglePasswordVisibility();
    expect(page.passwordVisible).toBe(true);
    expect(page.loginForm.controls.password.value).toBe('emilyspass');
    page.isSubmitting = true;
    page.togglePasswordVisibility();
    expect(page.passwordVisible).toBe(true);
    page.isSubmitting = false;
    await page.login();
    expect(page.passwordVisible).toBe(false);
    expect(page.loginForm.controls.password.value).toBe('');
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

  it('valida longitudes también cuando se invoca el método directamente', async () => {
    page.loginForm.setValue({ username: 'a'.repeat(101), password: 'secreto' });
    await page.login();
    expect(api.post).not.toHaveBeenCalled();
    expect(page.fieldError('username')).not.toBe('');
    page.loginForm.setValue({ username: 'ana', password: 'x'.repeat(201) });
    await page.login();
    expect(api.post).not.toHaveBeenCalled();
    expect(page.fieldError('password')).not.toBe('');
  });

  it.each(['disabled', 'pending'])('no envía el formulario en estado %s', async state => {
    page.fillDemo();
    if (state === 'disabled') page.loginForm.disable();
    else page.loginForm.markAsPending();
    await page.login();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('conserva espacios en la contraseña enviada', async () => {
    page.loginForm.setValue({ username: ' emilys ', password: ' emilyspass ' });
    await page.login();
    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'emilys', password: ' emilyspass ' });
  });

  it('no envía credenciales cuando el navegador está sin conexión', async () => {
    page.fillDemo();
    window.dispatchEvent(new Event('offline'));
    await page.login();
    expect(api.post).not.toHaveBeenCalled();
    expect(page.loginForm.enabled).toBe(true);
    expect(page.loginForm.controls.password.value).toBe('emilyspass');
  });

  it('muestra el error del servidor en el campo y permite corregirlo', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: {
      status: 422, data: { message: 'Revisa el usuario.', errors: { username: 'Este usuario no está disponible.' } },
    } });
    page.fillDemo();
    await page.login();
    expect(page.loginForm.enabled).toBe(true);
    expect(page.fieldError('username')).toBe('Este usuario no está disponible.');
    expect(page.loginForm.invalid).toBe(true);
    page.loginForm.controls.password.setValue('otraContraseña');
    expect(page.fieldError('username')).toBe('Este usuario no está disponible.');
    page.loginForm.controls.username.setValue('ana');
    expect(page.fieldError('username')).toBe('');
    await page.login();
    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
