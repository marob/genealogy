import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';

export const adminGuard: CanActivateFn = () => inject(SessionStore).isAdmin() || inject(Router).createUrlTree(['/']);
