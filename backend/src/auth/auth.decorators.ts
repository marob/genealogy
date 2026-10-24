import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';

export const ACCESS_KEY = 'genealogie:access';
export type Access = 'authenticated' | 'admin';

/** Réserve la route aux utilisateurs connectés. */
export const Authenticated = (): MethodDecorator & ClassDecorator => SetMetadata(ACCESS_KEY, 'authenticated');

/** Réserve la route aux administrateurs. */
export const AdminOnly = (): MethodDecorator & ClassDecorator => SetMetadata(ACCESS_KEY, 'admin');

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/** Utilisateur courant (undefined pour un visiteur anonyme). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
