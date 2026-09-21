import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { AuthResponse } from '../src/app/models/auth-response.model';
import type { LoginRequest } from '../src/app/models/auth-request.model';
import { Store } from './database';
import type { AuthenticatedSession, SessionClaims } from './types';
import { HttpError, isRecord } from './validation';

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const INVALID_PASSWORD_SALT = randomBytes(16).toString('hex');

function signature(secret: Buffer, unsigned: string): string {
  return createHmac('sha256', secret).update(unsigned).digest('base64url');
}

function equalText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function login(store: Store, request: LoginRequest, now: number): AuthResponse {
  const record = store.findUser(request.username);
  // También deriva una clave para un usuario inexistente; no revela qué nombres existen.
  const passwordHash = scryptSync(request.password, record?.passwordSalt ?? INVALID_PASSWORD_SALT, 64).toString('hex');
  if (!record || !equalText(passwordHash, record.passwordHash)) {
    throw new HttpError(401, 'Usuario o contraseña incorrectos.');
  }
  const claims: SessionClaims = {
    sub: record.user.id, iat: now, exp: now + (request.expiresInMins ?? 60) * 60,
    jti: randomBytes(24).toString('base64url'),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const unsigned = `${HEADER}.${payload}`;
  const accessToken = `${unsigned}.${signature(store.secret, unsigned)}`;
  store.addSession(accessToken, record.user.id, claims.exp, now);
  return { ...record.user, accessToken };
}

export function authenticate(store: Store, authorization: string | undefined, now: number): AuthenticatedSession {
  const unauthorized = (): never => { throw new HttpError(401, 'Inicia sesión nuevamente para continuar.'); };
  if (!authorization || !authorization.startsWith('Bearer ') || authorization.length > 4096) return unauthorized();
  const token = authorization.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return unauthorized();
  const unsigned = `${parts[0]}.${parts[1]}`;
  if (!equalText(signature(store.secret, unsigned), parts[2])) return unauthorized();
  let claims: unknown;
  try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); }
  catch { return unauthorized(); }
  if (!isRecord(claims) || typeof claims['exp'] !== 'number' || !Number.isSafeInteger(claims['exp']) ||
      claims['exp'] <= now || typeof claims['sub'] !== 'number') return unauthorized();
  const session = store.findSession(token, now);
  if (!session || session.user.id !== claims['sub']) return unauthorized();
  return session;
}
