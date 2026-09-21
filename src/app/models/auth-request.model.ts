/** Objeto que construye el formulario de inicio de sesión. Nunca se persiste. */
export interface LoginCredentials {
  username: string;
  password: string;
}

/** Cuerpo JSON de POST /api/auth/login. */
export interface LoginRequest extends LoginCredentials {
  expiresInMins?: number;
}
