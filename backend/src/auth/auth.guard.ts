import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Env } from '../config/env.js';
import { toAuthUser, UsersService } from '../users/users.service.js';
import { type Access, ACCESS_KEY, type AuthenticatedRequest } from './auth.decorators.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

/**
 * Global guard: identifies the user (session cookie or dev mode) then applies
 * the restrictions declared by `@Authenticated()` / `@AdminOnly()`.
 * Routes without a decorator remain public.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly devBypass: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    config: ConfigService<Env, true>,
  ) {
    this.devBypass = config.get('AUTH_DEV_BYPASS', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = await this.sessions.readSession(request.cookies[SESSION_COOKIE] as string | undefined);
    const user = userId === undefined ? null : await this.users.findById(userId);
    if (user) {
      request.user = toAuthUser(user);
    } else if (this.devBypass) {
      request.user = toAuthUser(await this.users.devUser());
    }

    const access = this.reflector.getAllAndOverride<Access | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (access && !request.user) {
      throw new UnauthorizedException();
    }
    if (access === 'admin' && request.user?.role !== 'ADMIN') {
      throw new ForbiddenException();
    }
    return true;
  }
}
