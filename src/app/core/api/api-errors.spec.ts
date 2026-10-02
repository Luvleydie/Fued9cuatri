import { AxiosError, CanceledError } from 'axios';
import { describe, expect, it } from 'vitest';
import { getErrorMessage, isRecoverableReadError, OfflineError } from './api-errors';

describe('Errores compartidos de acceso a datos', () => {
  const httpError = (status: number, message?: unknown) => ({ isAxiosError: true, response: { status, data: { message } } });

  it('permite consultar caché ante desconexión, timeout, red y fallos del servidor', () => {
    for (const error of [new OfflineError(), new AxiosError('network', 'ERR_NETWORK'), new AxiosError('timeout', 'ECONNABORTED'), new AxiosError('timeout', 'ETIMEDOUT'), httpError(500), httpError(503)]) {
      expect(isRecoverableReadError(error)).toBe(true);
    }
  });

  it('no oculta errores de permisos, validación, cancelación ni programación con la caché', () => {
    for (const error of [httpError(401), httpError(403), httpError(404), httpError(422), httpError(429), new CanceledError(), new AxiosError('config', 'ERR_BAD_OPTION'), new Error('bug'), null]) {
      expect(isRecoverableReadError(error)).toBe(false);
    }
  });

  it('distingue una escritura bloqueada antes del envío de una respuesta perdida', () => {
    expect(getErrorMessage(new OfflineError(), 'Error', true)).toContain('La operación no se envió');
    for (const error of [new AxiosError('network', 'ERR_NETWORK'), new AxiosError('timeout', 'ECONNABORTED'), httpError(503)]) {
      const message = getErrorMessage(error, 'Error', true);
      expect(message).toContain('No pudimos confirmar');
      expect(message).toContain('actualiza los datos antes de volver a intentarlo');
    }
  });

  it('explica los errores de lectura sin exponer detalles internos', () => {
    expect(getErrorMessage(new OfflineError(), 'Error')).toContain('Sin conexión');
    expect(getErrorMessage(new AxiosError('private request', 'ECONNABORTED'), 'Error')).toContain('tardó demasiado');
    expect(getErrorMessage(new AxiosError('private request', 'ERR_NETWORK'), 'Error')).toContain('Revisa tu conexión');
    const message = getErrorMessage(httpError(500, 'SQLSTATE[HY000]: password=secret'), 'Error');
    expect(message).toContain('servicio no está disponible');
    expect(message).not.toMatch(/SQLSTATE|secret/);
  });

  it.each([
    [401, 'Inicia sesión'], [403, 'permiso'], [404, 'No encontramos'], [409, 'conflicto'], [422, 'formulario'], [429, 'Espera un momento'],
  ])('ofrece una indicación útil para HTTP %s', (status, expected) => {
    expect(getErrorMessage(httpError(Number(status)), 'Error')).toContain(expected);
  });

  it('conserva mensajes de validación legibles y descarta HTML, trazas y mensajes inválidos', () => {
    expect(getErrorMessage(httpError(401, 'Usuario o contraseña incorrectos.'), 'Error')).toBe('Usuario o contraseña incorrectos.');
    expect(getErrorMessage(httpError(409, 'Este correo ya está registrado.'), 'Error')).toBe('Este correo ya está registrado.');
    for (const message of ['<html>PHP warning</html>', 'SQLSTATE[HY000]', 'PDOException: connection refused', { detail: 'internal' }, 'x'.repeat(301)]) {
      expect(getErrorMessage(httpError(422, message), 'Error')).toContain('formulario');
    }
  });

  it('usa el texto del contexto para errores que no conoce', () => {
    expect(getErrorMessage(new Error('stack private'), 'No se pudo abrir la página.')).toBe('No se pudo abrir la página.');
  });

  it('conserva las indicaciones seguras de caché, validación y cambio de sesión', () => {
    for (const name of ['DataValidationError', 'CacheMissError', 'SessionChangedError']) {
      const error = new Error('No hay una copia temporal válida. Conéctate e inténtalo de nuevo.');
      error.name = name;
      expect(getErrorMessage(error, 'Error')).toBe(error.message);
      expect(isRecoverableReadError(error)).toBe(false);
    }
  });

  it('una respuesta inválida después de escribir exige verificar el resultado antes de reintentar', () => {
    const error = new Error('Los datos recibidos no tienen un formato válido. Inténtalo de nuevo.');
    error.name = 'DataValidationError';
    const message = getErrorMessage(error, 'Error', true);
    expect(message).toContain('No pudimos confirmar el resultado');
    expect(message).toContain('Actualiza los datos antes de volver a intentarlo');
  });
});
