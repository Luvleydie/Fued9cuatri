import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AxiosError, AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../core/api/axios-client';
import { User } from '../../models/user.model';
import { RegisterPage } from './register.page';

describe('RegisterPage', () => {
  const user: User = { id: 2, username: 'ana', firstName: 'Ana', lastName: 'López', email: 'ana@example.com' };
  const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
  const changeDetector = { markForCheck: vi.fn() };
  let page: RegisterPage;

  beforeEach(() => {
    vi.clearAllMocks();
    window.dispatchEvent(new Event('online'));
    router.navigateByUrl.mockResolvedValue(true);
    vi.spyOn(api, 'post').mockResolvedValue({ data: user } as AxiosResponse<User>);
    page = new RegisterPage(router as unknown as Router, changeDetector as unknown as ChangeDetectorRef);
    page.registerForm.setValue({ username: ' ana ', firstName: ' Ana ', lastName: ' López ', email: ' ana@example.com ', password: 'contraseña123', confirmPassword: 'contraseña123' });
  });

  afterEach(() => {
    page.ngOnDestroy();
    window.dispatchEvent(new Event('online'));
    vi.restoreAllMocks();
  });

  it('envía el usuario normalizado y regresa a login después del registro', async () => {
    await page.register();
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      username: 'ana', firstName: 'Ana', lastName: 'López', email: 'ana@example.com', password: 'contraseña123',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login?registered=1', { replaceUrl: true });
    expect(page.registerForm.controls.password.value).toBe('');
    expect(page.registerForm.controls.confirmPassword.value).toBe('');
    expect(page.successMessage).toContain('Cuenta creada');
    expect(page.isSubmitting).toBe(false);
  });

  it('muestra cada contraseña por separado y vuelve a ocultarlas después de crear la cuenta', async () => {
    page.togglePasswordVisibility('password');
    expect(page.passwordVisible).toBe(true);
    expect(page.confirmationVisible).toBe(false);
    expect(page.registerForm.controls.password.value).toBe('contraseña123');
    page.togglePasswordVisibility('confirmPassword');
    expect(page.confirmationVisible).toBe(true);
    page.isSubmitting = true;
    page.togglePasswordVisibility('password');
    page.togglePasswordVisibility('confirmPassword');
    expect(page.passwordVisible).toBe(true);
    expect(page.confirmationVisible).toBe(true);
    page.isSubmitting = false;
    await page.register();
    expect(page.passwordVisible).toBe(false);
    expect(page.confirmationVisible).toBe(false);
    expect(page.registerForm.controls.password.value).toBe('');
    expect(page.registerForm.controls.confirmPassword.value).toBe('');
  });

  it('requiere contraseña de ocho caracteres y campos con contenido', async () => {
    page.registerForm.controls.password.setValue('corta');
    await page.register();
    expect(api.post).not.toHaveBeenCalled();
    expect(page.errorMessage).toContain('8 caracteres');
    expect(page.registerForm.controls.password.touched).toBe(true);
    expect(page.fieldError('password')).not.toBe('');
    page.registerForm.patchValue({ password: 'suficientementeLarga', confirmPassword: 'suficientementeLarga', firstName: '   ' });
    await page.register();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('bloquea duplicados durante la petición y después de crear la cuenta', async () => {
    let resolveRequest!: (value: AxiosResponse<User>) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const request = page.register();
    expect(page.isSubmitting).toBe(true);
    expect(page.registerForm.disabled).toBe(true);
    await page.register();
    expect(api.post).toHaveBeenCalledTimes(1);
    resolveRequest({ data: user } as AxiosResponse<User>);
    await request;
    expect(page.registerForm.enabled).toBe(true);
    await page.register();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('muestra conflictos de usuario y permite corregirlos', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { message: 'El usuario ya existe.' } } });
    await page.register();
    expect(page.errorMessage).toBe('El usuario ya existe.');
    expect(page.isSubmitting).toBe(false);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    page.registerForm.controls.username.setValue('ana2');
    await page.register();
    expect(page.errorMessage).toBe('');
    expect(page.successMessage).toContain('Cuenta creada');
  });

  it('muestra un error de conexión cuando Axios no recibe respuesta', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    await page.register();
    expect(page.errorMessage).toContain('Revisa tu conexión');
    expect(page.isSubmitting).toBe(false);
    expect(page.registerForm.enabled).toBe(true);
    expect(page.registerForm.controls.username.value).toBe(' ana ');
    expect(page.registerForm.controls.password.value).toBe('contraseña123');
    expect(page.successMessage).toBe('');
  });

  it('conserva la confirmación si se crea la cuenta pero falla la navegación', async () => {
    router.navigateByUrl.mockRejectedValueOnce(new Error('Router error'));
    await page.register();
    expect(page.successMessage).toContain('Cuenta creada');
    expect(page.errorMessage).toContain('Iniciar sesión');
    await page.register();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['username', 'ana con espacios'],
    ['email', 'correo-inválido'],
    ['email', 'ana@example'],
    ['confirmPassword', 'otraContraseña123'],
    ['confirmPassword', ''],
  ] as const)('rechaza %s inválido sin enviar datos a la API (%s)', async (field, value) => {
    page.registerForm.controls[field].setValue(value);
    await page.register();
    expect(api.post).not.toHaveBeenCalled();
    expect(page.registerForm.invalid).toBe(true);
    expect(page.registerForm.controls[field].touched).toBe(true);
    expect(page.fieldError(field)).not.toBe('');
  });

  it('muestra los errores después de tocar un campo o intentar enviar', () => {
    page.registerForm.controls.email.setValue('correo-inválido');
    expect(page.fieldError('email')).toBe('');
    page.registerForm.controls.email.markAsTouched();
    expect(page.fieldError('email')).not.toBe('');
    expect(changeDetector.markForCheck).toHaveBeenCalled();
  });

  it('muestra errores por campo del servidor y los retira al corregir ese campo', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: {
      status: 400, data: { message: 'Revisa los datos.', errors: { username: 'Elige otro usuario.', email: 'Revisa este correo.' } },
    } });
    await page.register();
    expect(page.registerForm.enabled).toBe(true);
    expect(page.fieldError('username')).toBe('Elige otro usuario.');
    expect(page.fieldError('email')).toBe('Revisa este correo.');
    page.registerForm.controls.username.setValue('ana2');
    expect(page.fieldError('username')).toBe('');
    expect(page.fieldError('email')).toBe('Revisa este correo.');
    await page.register();
    expect(api.post).toHaveBeenCalledTimes(1);
    page.registerForm.controls.email.setValue('ana2@example.com');
    await page.register();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(page.successMessage).toContain('Cuenta creada');
  });

  it('restaura los controles después de una petición de red fallida', async () => {
    let rejectRequest!: (error: unknown) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
    const request = page.register();
    expect(page.registerForm.disabled).toBe(true);
    rejectRequest(new AxiosError('Network Error', 'ERR_NETWORK'));
    await request;
    expect(page.registerForm.enabled).toBe(true);
    expect(page.isSubmitting).toBe(false);
    expect(page.errorMessage).toContain('Revisa tu conexión');
  });

  it('no registra cuentas mientras el navegador está sin conexión', async () => {
    window.dispatchEvent(new Event('offline'));
    await page.register();
    expect(api.post).not.toHaveBeenCalled();
    expect(page.registerForm.enabled).toBe(true);
    expect(page.isSubmitting).toBe(false);
  });

  it.each(['disabled', 'pending'])('no envía el registro en estado %s', async state => {
    if (state === 'disabled') page.registerForm.disable();
    else page.registerForm.markAsPending();
    await page.register();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('envía la contraseña intacta y excluye la confirmación del payload', async () => {
    page.registerForm.patchValue({ password: ' contraseña123 ', confirmPassword: ' contraseña123 ' });
    await page.register();
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      username: 'ana', firstName: 'Ana', lastName: 'López', email: 'ana@example.com', password: ' contraseña123 ',
    });
    expect(page.registerForm.controls.password.value).toBe('');
    expect(page.registerForm.controls.confirmPassword.value).toBe('');
  });
});
