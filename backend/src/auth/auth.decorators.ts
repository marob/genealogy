import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';

export const ACCESS_KEY = 'genealogie:access';
export type Access = 'authenticated' | 'admin';

/** Restricts the route to logged-in users. */
export const Authenticated = (): MethodDecorator & ClassDecorator => SetMetadata(ACCESS_KEY, 'authenticated');

/** Restricts the route to administrators. */
export const AdminOnly = (): MethodDecorator & ClassDecorator => SetMetadata(ACCESS_KEY, 'admin');

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/** Current user (undefined for an anonymous visitor). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
