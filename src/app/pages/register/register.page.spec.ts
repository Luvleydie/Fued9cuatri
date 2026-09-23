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
    router.navigateByUrl.mockResolvedValue(true);
    vi.spyOn(api, 'post').mockResolvedValue({ data: user } as AxiosResponse<User>);
    page = new RegisterPage(router as unknown as Router, changeDetector as unknown as ChangeDetectorRef);
    page.user = { username: ' ana ', firstName: ' Ana ', lastName: ' López ', email: ' ana@example.com ', password: 'contraseña123' };
  });

  afterEach(() => vi.restoreAllMocks());

  it('envía el usuario normalizado y regresa a login después del registro', async () => {
    await page.register();
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      username: 'ana', firstName: 'Ana', lastName: 'López', email: 'ana@example.com', password: 'contraseña123',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login?registered=1', { replaceUrl: true });
    expect(page.user.password).toBe('');
    expect(page.successMessage).toContain('Cuenta creada');
    expect(page.isSubmitting).toBe(false);
  });

  it('requiere contraseña de ocho caracteres y campos con contenido', async () => {
    page.user.password = 'corta';
    await page.register();
    expect(api.post).not.toHaveBeenCalled();
    expect(page.errorMessage).toContain('8 caracteres');
    page.user.password = 'suficientementeLarga';
    page.user.firstName = '   ';
    await page.register();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('bloquea duplicados durante la petición y después de crear la cuenta', async () => {
    let resolveRequest!: (value: AxiosResponse<User>) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const request = page.register();
    expect(page.isSubmitting).toBe(true);
    await page.register();
    expect(api.post).toHaveBeenCalledTimes(1);
    resolveRequest({ data: user } as AxiosResponse<User>);
    await request;
    await page.register();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('muestra conflictos de usuario y permite corregirlos', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { message: 'El usuario ya existe.' } } });
    await page.register();
    expect(page.errorMessage).toBe('El usuario ya existe.');
    expect(page.isSubmitting).toBe(false);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    page.user.username = 'ana2';
    await page.register();
    expect(page.errorMessage).toBe('');
    expect(page.successMessage).toContain('Cuenta creada');
  });

  it('muestra un error de conexión cuando Axios no recibe respuesta', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    await page.register();
    expect(page.errorMessage).toContain('Revisa tu conexión');
    expect(page.isSubmitting).toBe(false);
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
});
