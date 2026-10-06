import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { clearSession, saveSession } from '../../core/api/session-storage';
import { UsersService } from '../../services/users.service';
import { HomePage } from './home.page';

describe('Usuarios con formulario Data Driven', () => {
  const current = { id: 1, username: 'emilys', firstName: 'Emily', lastName: 'Smith', email: 'emily@example.test' };
  const other = { id: 2, username: 'ana', firstName: 'Ana', lastName: 'López', email: 'ana@example.test' };
  const valid = { username: 'nueva', firstName: 'Nueva', lastName: 'Cuenta', email: 'nueva@example.test', password: 'Password-123', confirmPassword: 'Password-123' };
  const service = { getUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn() };
  const router = { navigateByUrl: vi.fn() };
  let page: HomePage;

  beforeEach(async () => {
    vi.resetAllMocks();
    clearSession();
    window.dispatchEvent(new Event('online'));
    saveSession({ ...current, accessToken: 'a'.repeat(64), expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    service.getUsers.mockResolvedValue({ data: [current, other], source: 'network', storage: 'session', savedAt: Date.now() });
    service.createUser.mockResolvedValue({ ...other, username: valid.username });
    service.updateUser.mockResolvedValue(other);
    router.navigateByUrl.mockResolvedValue(true);
    page = new HomePage(service as unknown as UsersService, router as unknown as Router, { markForCheck: vi.fn() } as unknown as ChangeDetectorRef);
    page.ngOnInit();
    await vi.waitFor(() => expect(page.isLoading).toBe(false));
  });

  afterEach(() => { page.ngOnDestroy(); clearSession(); window.dispatchEvent(new Event('online')); });

  it('valida también cuando se llama guardar directamente, sin depender del botón HTML', async () => {
    await page.saveUser();
    expect(service.createUser).not.toHaveBeenCalled();
    expect(page.userForm.touched).toBe(true);
    expect(page.fieldError('username')).not.toBe('');
    expect(page.isSubmitting).toBe(false);
  });

  it.each([
    ['username', 'nombre con espacios'], ['email', 'sin-correo'], ['password', 'corta'], ['confirmPassword', 'distinta'],
  ])('impide enviar un %s inválido', async (field, value) => {
    page.userForm.setValue(valid);
    page.userForm.get(field)?.setValue(value);
    await page.saveUser();
    expect(service.createUser).not.toHaveBeenCalled();
    expect(page.userForm.invalid).toBe(true);
  });

  it('normaliza los campos, excluye confirmación y restablece el formulario tras éxito', async () => {
    page.userForm.setValue({ ...valid, firstName: ' Nueva ', email: ' nueva@example.test ' });
    await page.saveUser();
    expect(service.createUser).toHaveBeenCalledWith({ username: 'nueva', firstName: 'Nueva', lastName: 'Cuenta', email: 'nueva@example.test', password: 'Password-123' });
    expect(page.userForm.controls.password.value).toBe('');
    expect(page.userForm.controls.confirmPassword.value).toBe('');
    expect(page.userForm.pristine).toBe(true);
    expect(page.userForm.untouched).toBe(true);
  });

  it('precarga edición sin contraseña y la vuelve a exigir al cancelar', async () => {
    page.editUser(other);
    expect(page.userForm.valid).toBe(true);
    expect(page.userForm.controls.password.value).toBe('');
    await page.saveUser();
    expect(service.updateUser).toHaveBeenCalledWith(other.id, { username: 'ana', firstName: 'Ana', lastName: 'López', email: 'ana@example.test' });
    page.editUser(other);
    page.cancelEdit();
    expect(page.editingId).toBeNull();
    expect(page.userForm.controls.password.invalid).toBe(true);
    expect(page.userForm.untouched).toBe(true);
  });

  it('muestra errores del servidor por campo y permite corregirlos', async () => {
    page.userForm.setValue(valid);
    service.createUser.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { message: 'Revisa el correo.', errors: { email: 'Este correo no es válido.' } } } });
    await page.saveUser();
    expect(page.userForm.enabled).toBe(true);
    expect(page.fieldError('email')).toBe('Este correo no es válido.');
    page.userForm.controls.email.setValue('corregido@example.test');
    expect(page.fieldError('email')).toBe('');
    expect(page.userForm.valid).toBe(true);
  });

  it('bloquea el doble envío y conserva campos después de una respuesta incierta', async () => {
    page.userForm.setValue(valid);
    let reject!: (error: unknown) => void;
    service.createUser.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    const pending = page.saveUser();
    expect(page.userForm.disabled).toBe(true);
    await page.saveUser();
    reject(new AxiosError('Network Error', 'ERR_NETWORK'));
    await pending;
    expect(service.createUser).toHaveBeenCalledTimes(1);
    expect(page.userForm.getRawValue()).toEqual(valid);
    expect(page.userForm.enabled).toBe(true);
    expect(page.needsRefresh).toBe(true);
  });

  it('no envía el formulario sin conexión', async () => {
    page.userForm.setValue(valid);
    window.dispatchEvent(new Event('offline'));
    await page.saveUser();
    expect(service.createUser).not.toHaveBeenCalled();
    expect(page.userForm.getRawValue()).toEqual(valid);
  });

  it.each([
    ['EmIlYs', [1]],
    ['  ANA   LOPEZ  ', [2]],
    ['ANA@EXAMPLE.TEST', [2]],
    ['sin coincidencias', []],
    ['   ', [1, 2]],
  ] as const)('busca "%s" en usuario, nombre y correo sin depender de tildes o mayúsculas', (query, expected) => {
    page.searchTerm = query;
    expect(page.filteredUsers.map(user => user.id)).toEqual(expected);
    expect(page.users).toEqual([current, other]);
  });

  it('permite buscar y limpiar sin conexión sin solicitar datos ni alterar una edición', () => {
    page.editUser(other);
    const draft = page.userForm.getRawValue();
    service.getUsers.mockClear();
    window.dispatchEvent(new Event('offline'));
    page.searchTerm = 'lopez';
    expect(page.filteredUsers).toEqual([other]);
    expect(page.hasSearch).toBe(true);
    expect(page.dataStateLabel).toBe('Sin conexión');
    page.clearSearch();
    expect(page.filteredUsers).toEqual([current, other]);
    expect(page.hasSearch).toBe(false);
    expect(page.userForm.getRawValue()).toEqual(draft);
    expect(service.getUsers).not.toHaveBeenCalled();
  });

  it('distingue un directorio vacío de una búsqueda sin resultados', () => {
    page.searchTerm = 'cuenta-inexistente';
    expect(page.filteredUsers).toEqual([]);
    expect(page.users.length).toBe(2);
    page.clearSearch();
    page.users = [];
    expect(page.filteredUsers).toEqual([]);
    expect(page.hasSearch).toBe(false);
    expect(page.users.length).toBe(0);
  });
});
