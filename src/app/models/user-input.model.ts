/** Campos editables del usuario; en una edición la contraseña vacía se conserva. */
export interface UserInput {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
}
