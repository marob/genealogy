import { Controller, Delete, Get, HttpCode, Logger, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MeDto } from '@genealogie/shared';
import type { Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { toUserDto, UsersService } from '../users/users.service.js';
import { AuthProvidersService } from './auth-providers.service.js';
import type { AuthUser } from './auth-user.js';
import { Authenticated, CurrentUser } from './auth.decorators.js';
import { OAUTH_COOKIE, SessionService } from './session.service.js';

/** Only accepts paths internal to the application (no open redirect). */
function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/';
}

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly publicUrl: string;
  private readonly devBypass: boolean;
  private readonly contactEmail: string | undefined;

  constructor(
    private readonly providers: AuthProvidersService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    config: ConfigService<Env, true>,
  ) {
    this.publicUrl = config.get('PUBLIC_URL', { infer: true }).replace(/\/$/, '');
    this.devBypass = config.get('AUTH_DEV_BYPASS', { infer: true });
    this.contactEmail = config.get('CONTACT_EMAIL', { infer: true });
  }

  @Get('me')
  async me(@CurrentUser() currentUser: AuthUser | undefined): Promise<MeDto> {
    const user = currentUser && (await this.users.findById(currentUser.id));
    return {
      ...(user ? { user: toUserDto(user) } : {}),
      providers: this.providers.list(),
      devBypass: this.devBypass,
      ...(this.contactEmail ? { contactEmail: this.contactEmail } : {}),
    };
  }

  @Delete('me')
  @Authenticated()
  @HttpCode(204)
  async deleteAccount(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.users.deleteOwnAccount(user);
    this.sessions.closeSession(res);
  }

  @Get('auth/:provider/login')
  async login(
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const request = await this.providers.authorizationRequest(provider);
    await this.sessions.saveOAuthTransaction(res, {
      provider,
      state: request.state,
      nonce: request.nonce,
      codeVerifier: request.codeVerifier,
      returnTo: safeReturnPath(returnTo),
    });
    res.redirect(request.url.href);
  }

  @Get('auth/:provider/callback')
  async callback(@Param('provider') provider: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const transaction = await this.sessions.takeOAuthTransaction(res, req.cookies[OAUTH_COOKIE] as string | undefined);
    if (transaction?.provider !== provider) {
      res.redirect(`${this.publicUrl}/login?error=expired`);
      return;
    }
    try {
      // The public URL is authoritative (the backend may be behind a proxy).
      const currentUrl = new URL(
        `${this.providers.callbackUrl(provider)}?${new URL(req.url, 'http://x').searchParams}`,
      );
      const identity = await this.providers.handleCallback(provider, currentUrl, transaction);
      const user = await this.users.loginWithIdentity(identity);
      await this.sessions.openSession(res, user.id);
      res.redirect(`${this.publicUrl}${transaction.returnTo}`);
    } catch (error) {
      this.logger.warn(`${provider} authentication failed: ${(error as Error).message}`);
      res.redirect(`${this.publicUrl}/login?error=failed`);
    }
  }

  @Post('auth/logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    this.sessions.closeSession(res);
  }
}
