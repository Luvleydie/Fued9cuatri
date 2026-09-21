import { User } from './user.model';

export interface AuthResponse extends User {
  accessToken: string;
}
