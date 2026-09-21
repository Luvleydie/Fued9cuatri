import type { ApiError } from '../src/app/models/api-error.model';
import type { LoginRequest } from '../src/app/models/auth-request.model';
import type { ProductInput } from '../src/app/models/product-input.model';

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly errors?: Record<string, string>) {
    super(message);
  }

  toResponse(): ApiError {
    return this.errors ? { message: this.message, errors: this.errors } : { message: this.message };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectPayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new HttpError(400, 'El cuerpo debe ser un objeto JSON.');
  return value;
}

function readText(
  record: Record<string, unknown>, key: string, limit: number,
  errors: Record<string, string>, required = true,
): string {
  const raw = record[key];
  if (raw === undefined && !required) return '';
  if (typeof raw !== 'string') {
    errors[key] = 'Debe ser texto.';
    return '';
  }
  const value = raw.trim();
  if (required && !value) errors[key] = 'Este campo es obligatorio.';
  else if (value.length > limit) errors[key] = `Admite un máximo de ${limit} caracteres.`;
  else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    errors[key] = 'El texto contiene caracteres de control no permitidos.';
  }
  return value;
}

export function validateLogin(value: unknown): LoginRequest {
  const record = objectPayload(value);
  const errors: Record<string, string> = {};
  const username = readText(record, 'username', 100, errors);
  const password = record['password'];
  if (typeof password !== 'string' || password.length < 1 || password.length > 200) {
    errors['password'] = 'La contraseña debe tener de 1 a 200 caracteres.';
  }
  const expiresInMins = record['expiresInMins'] === undefined ? 60 : record['expiresInMins'];
  if (typeof expiresInMins !== 'number' || !Number.isInteger(expiresInMins) || expiresInMins < 1 || expiresInMins > 1440) {
    errors['expiresInMins'] = 'La sesión debe durar de 1 a 1440 minutos enteros.';
  }
  if (Object.keys(errors).length || typeof password !== 'string' || typeof expiresInMins !== 'number') {
    throw new HttpError(400, 'Revisa los datos de acceso.', errors);
  }
  return { username, password, expiresInMins };
}

export function isSafeImage(value: string): boolean {
  if (!value) return true;
  if (/[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  if (/^assets\/[a-zA-Z0-9_./-]+$/u.test(value)) {
    return !value.split('/').some(part => part === '..' || part === '.' || part === '');
  }
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateProduct(value: unknown): ProductInput {
  const record = objectPayload(value);
  const errors: Record<string, string> = {};
  const title = readText(record, 'title', 160, errors);
  const description = readText(record, 'description', 2000, errors);
  const category = readText(record, 'category', 80, errors);
  const brand = readText(record, 'brand', 120, errors, false);
  const thumbnail = readText(record, 'thumbnail', 2000, errors, false);
  const price = record['price'];
  const stock = record['stock'];
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 1000000 ||
      Math.round(price * 100) / 100 !== price) {
    errors['price'] = 'Introduce un precio entre 0 y 1000000 con máximo dos decimales.';
  }
  if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    errors['stock'] = 'Introduce existencias enteras entre 0 y 1000000.';
  }
  if (!isSafeImage(thumbnail)) {
    errors['thumbnail'] = 'Usa una URL http(s) sin credenciales o una ruta segura assets/.';
  }
  if (Object.keys(errors).length || typeof price !== 'number' || typeof stock !== 'number') {
    throw new HttpError(400, 'Revisa los campos del producto.', errors);
  }
  return { title, description, category, price, stock, brand, thumbnail };
}

export function validateId(value: string): number {
  if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(400, 'El identificador debe ser un entero positivo.');
  }
  return Number(value);
}
