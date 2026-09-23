import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { readUser } from '../core/api/session-storage';

export const authGuard: CanActivateFn = () =>
  Boolean(readUser()) || inject(Router).createUrlTree(['/login']);

export const guestGuard: CanActivateFn = () =>
  !readUser() || inject(Router).createUrlTree(['/home']);
