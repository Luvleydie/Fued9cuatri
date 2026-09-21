import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../core/api/axios-client';
import { TOKEN_KEY, USER_KEY } from '../core/api/session-storage';
import { AuthService } from './auth.service';

const validToken = () => `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
const publicUser = { id: 1, username: 'emilys', firstName: 'Emily', lastName: 'Johnson', email: 'emily@example.test' };

describe('AuthService', () => {
  const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
  beforeEach(() => {
    localStorage.clear();
    router.navigateByUrl.mockClear();
    TestBed.configureTestingModule({ providers: [AuthService, { provide: Router, useValue: router }] });
  });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  async function login(service: AuthService): Promise<string> {
    const accessToken = validToken();
    vi.spyOn(api, 'post').mockResolvedValue({ data: { ...publicUser, accessToken, refreshToken: 'refresh-secret', password: 'demo-secret' } });
    await service.login({ username: ' emilys ', password: 'emilyspass' });
    return accessToken;
  }

  it('autentica mediante Axios y persiste únicamente access token y usuario permitido', async () => {
    const service = TestBed.inject(AuthService);
    const accessToken = await login(service);
    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'emilys', password: 'emilyspass', expiresInMins: 60 });
    expect(service.isAuthenticated()).toBe(true);
    expect(service.getToken()).toBe(accessToken);
    expect(JSON.parse(localStorage.getItem(USER_KEY)!)).toEqual(publicUser);
    expect(localStorage.getItem(USER_KEY)).not.toContain('secret');
  });

  it('restaura una sesión al reconstruir el servicio', async () => {
    await login(TestBed.inject(AuthService));
    const restored = TestBed.runInInjectionContext(() => new AuthService());
    expect(restored.isAuthenticated()).toBe(true);
    expect(restored.user()).toEqual(publicUser);
  });

  it('rechaza el login fallido y no crea una sesión local', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('invalid credentials'));
    const service = TestBed.inject(AuthService);
    await expect(service.login({ username: 'wrong', password: 'wrong' })).rejects.toThrow();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('recupera el perfil real y filtra contraseña y campos ajenos al modelo', async () => {
    const service = TestBed.inject(AuthService);
    await login(service);
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ...publicUser, image: 'image.png', password: 'secret', bank: { cardNumber: '123' } } });
    expect(await service.getCurrentUser()).toEqual({ ...publicUser, image: 'image.png' });
    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(JSON.parse(localStorage.getItem(USER_KEY)!)).toEqual({ ...publicUser, image: 'image.png' });
  });

  it.each([401, 403])('cierra sesión cuando /auth/me responde %s', async (status) => {
    const service = TestBed.inject(AuthService);
    await login(service);
    vi.spyOn(api, 'get').mockRejectedValue({ isAxiosError: true, response: { status } });
    await expect(service.getCurrentUser()).rejects.toBeDefined();
    expect(service.isAuthenticated()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });

  it('conserva la sesión ante un fallo transitorio de conexión del perfil', async () => {
    const service = TestBed.inject(AuthService);
    await login(service);
    vi.spyOn(api, 'get').mockRejectedValue({ isAxiosError: true, code: 'ERR_NETWORK' });
    await expect(service.getCurrentUser()).rejects.toBeDefined();
    expect(service.isAuthenticated()).toBe(true);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('logout elimina token y usuario, conserva el carrito y redirige', async () => {
    const service = TestBed.inject(AuthService);
    await login(service);
    localStorage.setItem('novacart.cart', '[{"demo":true}]');
    await service.logout();
    expect(api.post).toHaveBeenLastCalledWith('/auth/logout');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(service.user()).toBeNull();
    expect(localStorage.getItem('novacart.cart')).toBe('[{"demo":true}]');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });
  it('limpia la sesión local aunque no se pueda contactar con logout', async () => {
    const service = TestBed.inject(AuthService);
    await login(service);
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    await service.logout();
    expect(service.user()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });
});
