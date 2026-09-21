import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { MOCK_PRODUCTS } from '../src/app/data/mock-products';
import type { Product, ProductsResponse } from '../src/app/models/product.model';
import type { ProductInput } from '../src/app/models/product-input.model';
import type { User } from '../src/app/models/user.model';
import type { AuthenticatedSession, UserRecord } from './types';

export const PROJECT_ROOT = resolve(__dirname, '../../..');
type DatabaseRow = Record<string, SQLOutputValue>;

function textColumn(row: DatabaseRow, name: string): string {
  const value = row[name];
  if (typeof value !== 'string') throw new Error(`Invalid database column: ${name}`);
  return value;
}

function numberColumn(row: DatabaseRow, name: string): number {
  const value = row[name];
  if (typeof value !== 'number') throw new Error(`Invalid database column: ${name}`);
  return value;
}

function toUser(row: DatabaseRow): User {
  return {
    id: numberColumn(row, 'id'), username: textColumn(row, 'username'), email: textColumn(row, 'email'),
    firstName: textColumn(row, 'first_name'), lastName: textColumn(row, 'last_name'), image: textColumn(row, 'image'),
  };
}

function toProduct(row: DatabaseRow): Product {
  const imageData: unknown = JSON.parse(textColumn(row, 'images_json'));
  const images = Array.isArray(imageData) ? imageData.filter((entry): entry is string => typeof entry === 'string') : [];
  return {
    id: numberColumn(row, 'id'), title: textColumn(row, 'title'), description: textColumn(row, 'description'),
    category: textColumn(row, 'category'), price: numberColumn(row, 'price_cents') / 100,
    stock: numberColumn(row, 'stock'), brand: textColumn(row, 'brand'), thumbnail: textColumn(row, 'thumbnail'),
    images, ...(typeof row['rating'] === 'number' ? { rating: row['rating'] } : {}),
    ...(typeof row['discount_percentage'] === 'number' ? { discountPercentage: row['discount_percentage'] } : {}),
  };
}

function signingKey(databasePath: string): Buffer {
  if (databasePath === ':memory:') return randomBytes(32);
  const keyPath = `${databasePath}.secret`;
  try {
    writeFileSync(keyPath, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
  }
  const value = readFileSync(keyPath, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error('Invalid session signing key file.');
  return Buffer.from(value, 'hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class Store {
  readonly secret: Buffer;
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.secret = signingKey(databasePath);
    this.db = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true, timeout: 5000 });
    try {
      this.db.exec('PRAGMA journal_mode = WAL');
      // Confirmar cada transacción sólo después de sincronizar el WAL con el disco.
      this.db.exec('PRAGMA synchronous = FULL');
      const version = this.db.prepare('PRAGMA user_version').get();
      if (!version || numberColumn(version, 'user_version') > 1) throw new Error('Unsupported database schema version.');
      this.db.exec('BEGIN IMMEDIATE');
      this.db.exec(readFileSync(resolve(PROJECT_ROOT, 'server/schema.sql'), 'utf8'));
      if (numberColumn(version, 'user_version') === 0) {
        this.seed();
        this.db.exec('PRAGMA user_version = 1');
      }
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      this.db.close();
      throw error;
    }
  }

  private seed(): void {
    const salt = randomBytes(16).toString('hex');
    const passwordHash = scryptSync('emilyspass', salt, 64).toString('hex');
    const inserted = this.db.prepare(`
      INSERT INTO users (username, email, first_name, last_name, password_hash, password_salt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('emilys', 'emily@novacart.local', 'Emily', 'Johnson', passwordHash, salt);
    const userId = Number(inserted.lastInsertRowid);
    const insertProduct = this.db.prepare(`
      INSERT INTO products (id, title, description, category, price_cents, stock, brand, thumbnail,
        images_json, rating, discount_percentage, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const product of MOCK_PRODUCTS) {
      insertProduct.run(
        product.id, product.title, product.description, product.category, Math.round(product.price * 100),
        product.stock ?? 0, product.brand ?? '', product.thumbnail ?? '', JSON.stringify(product.images ?? []),
        product.rating ?? null, product.discountPercentage ?? null, userId,
      );
    }
  }

  findUser(username: string): UserRecord | null {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    return row ? {
      user: toUser(row), passwordHash: textColumn(row, 'password_hash'), passwordSalt: textColumn(row, 'password_salt'),
    } : null;
  }

  addSession(token: string, userId: number, expiresAt: number, now: number): void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), userId, expiresAt);
  }

  findSession(token: string, now: number): AuthenticatedSession | null {
    const tokenHash = hashToken(token);
    const row = this.db.prepare(`
      SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash, now);
    return row ? { user: toUser(row), tokenHash } : null;
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  listProducts(): ProductsResponse {
    const products = this.db.prepare('SELECT * FROM products ORDER BY id').all().map(toProduct);
    return { products, total: products.length, skip: 0, limit: products.length };
  }

  getProduct(id: number): Product | null {
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    return row ? toProduct(row) : null;
  }

  createProduct(product: ProductInput, createdBy: number): Product {
    const thumbnail = product.thumbnail ?? '';
    const inserted = this.db.prepare(`
      INSERT INTO products (title, description, category, price_cents, stock, brand, thumbnail, images_json, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(product.title, product.description, product.category, Math.round(product.price * 100), product.stock,
      product.brand ?? '', thumbnail, JSON.stringify(thumbnail ? [thumbnail] : []), createdBy);
    const result = this.getProduct(Number(inserted.lastInsertRowid));
    if (!result) throw new Error('Product insertion failed.');
    return result;
  }

  updateProduct(id: number, input: ProductInput): Product | null {
    const previous = this.getProduct(id);
    if (!previous) return null;
    const thumbnail = input.thumbnail ?? '';
    // Los datos de solo lectura se conservan. La galería sigue la miniatura cuando cambia.
    const images = thumbnail === previous.thumbnail ? previous.images ?? [] : thumbnail ? [thumbnail] : [];
    this.db.prepare(`
      UPDATE products SET title = ?, description = ?, category = ?, price_cents = ?, stock = ?, brand = ?,
        thumbnail = ?, images_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(input.title, input.description, input.category, Math.round(input.price * 100), input.stock,
      input.brand ?? '', thumbnail, JSON.stringify(images), id);
    return this.getProduct(id);
  }

  deleteProduct(id: number): boolean {
    return Number(this.db.prepare('DELETE FROM products WHERE id = ?').run(id).changes) > 0;
  }

  close(): void {
    this.db.close();
  }
}
