import { Controller, Get, HttpCode, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DevAccountDto } from '@genealogie/shared';
import type { Request, Response } from 'express';
import { type Env, LOCAL_HOSTS } from '../config/env.js';
import { DEV_ACCOUNTS, UsersService } from '../users/users.service.js';
import { SessionService } from './session.service.js';

/**
 * Development mode (AUTH_DEV_BYPASS): switch between test accounts to see
 * the site as an administrator or as members. Not available otherwise.
 */
@Controller('dev/accounts')
export class DevController {
  private readonly devBypass: boolean;

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    config: ConfigService<Env, true>,
  ) {
    this.devBypass = config.get('AUTH_DEV_BYPASS', { infer: true });
  }

  private check(request: Request): void {
    if (!this.devBypass || !LOCAL_HOSTS.has(request.hostname)) {
      throw new NotFoundException();
    }
  }

  @Get()
  list(@Req() request: Request): DevAccountDto[] {
    this.check(request);
    return DEV_ACCOUNTS.map((account) => ({
      email: account.email,
      name: account.displayName,
      role: account.role,
      canSeeContemporary: account.canSeeContemporary,
    }));
  }

  /** Opens a session as this account (signing out goes back to the default administrator). */
  @Post(':email/login')
  @HttpCode(204)
  async login(@Req() request: Request, @Param('email') email: string, @Res({ passthrough: true }) res: Response) {
    this.check(request);
    const user = await this.users.devAccount(email);
    await this.sessions.openSession(res, user.id);
  }
}
