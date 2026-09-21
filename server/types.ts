import type { User } from '../src/app/models/user.model';

/** Datos privados leídos de SQLite: nunca se serializan en la API. */
export interface UserRecord {
  user: User;
  passwordHash: string;
  passwordSalt: string;
}

/** Sesión comprobada en la base de datos y vinculada a un usuario. */
export interface AuthenticatedSession {
  user: User;
  tokenHash: string;
}

/** Contenido firmado del token; su vigencia también se comprueba en SQLite. */
export interface SessionClaims {
  sub: number;
  exp: number;
  iat: number;
  jti: string;
}

export interface ApplicationOptions {
  databasePath: string;
  staticDirectory?: string;
  now?: () => number;
}
