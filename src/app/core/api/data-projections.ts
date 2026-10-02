import { CartResponse } from '../../models/cart-item.model';
import { Product } from '../../models/product.model';
import { User } from '../../models/user.model';
import { DataValidationError } from './data-cache';
import { toUser } from './session-storage';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DataValidationError();
  return value as Record<string, unknown>;
}

function integer(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new DataValidationError();
  return value;
}

function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new DataValidationError();
  return value;
}

function title(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new DataValidationError();
  return value;
}

function list<T>(value: unknown, project: (value: unknown) => T, id: (value: T) => number): T[] {
  if (!Array.isArray(value)) throw new DataValidationError();
  const data = value.map(project);
  if (new Set(data.map(id)).size !== data.length) throw new DataValidationError();
  return data;
}

export function projectUser(value: unknown): User {
  try { return toUser(value); } catch { throw new DataValidationError(); }
}

export function projectUsers(value: unknown): User[] {
  return list(value, projectUser, user => user.id);
}

export function projectProducts(value: unknown): Product[] {
  return list(value, item => {
    const data = record(item);
    return { id: integer(data['id'], 1), title: title(data['title']), price: amount(data['price']), stock: integer(data['stock'], 0) };
  }, product => product.id);
}

export function projectCart(value: unknown): CartResponse {
  const data = record(value);
  const items = list(data['items'], item => {
    const row = record(item);
    return {
      productId: integer(row['productId'], 1), title: title(row['title']), price: amount(row['price']),
      quantity: integer(row['quantity'], 1), stock: integer(row['stock'], 0),
    };
  }, item => item.productId);
  const total = amount(data['total']);
  const cents = items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
  if (!Number.isSafeInteger(cents) || Math.abs(total * 100 - cents) > 0.01) throw new DataValidationError();
  return { items, total };
}
