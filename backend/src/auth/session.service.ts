import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import type { Env } from '../config/env.js';

export const SESSION_COOKIE = 'genealogie_session';
export const OAUTH_COOKIE = 'genealogie_oauth';
const SESSION_DURATION_SECONDS = 30 * 24 * 3600;
const OAUTH_DURATION_SECONDS = 10 * 60;

/** Pending OAuth transaction (between the redirect and the callback). */
export interface OAuthTransaction {
  provider: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

/**
 * Stateless sessions: a signed JWT (HS256) stored in an httpOnly cookie.
 * The user is reloaded from the database on every request, so a permission
 * change or an account deletion takes effect immediately.
 */
@Injectable()
export class SessionService {
  private readonly key: Uint8Array;
  private readonly secure: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.key = new TextEncoder().encode(config.get('SESSION_SECRET', { infer: true }));
    this.secure = config.get('PUBLIC_URL', { infer: true }).startsWith('https://');
  }

  private cookieOptions(maxAgeSeconds: number): CookieOptions {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api', maxAge: maxAgeSeconds * 1000 };
  }

  private sign(payload: Record<string, unknown>, audience: string, durationSeconds: number): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setAudience(audience)
      .setExpirationTime(`${durationSeconds}s`)
      .sign(this.key);
  }

  private async verify(token: string | undefined, audience: string): Promise<Record<string, unknown> | undefined> {
    if (!token) {
      return undefined;
    }
    try {
      const { payload } = await jwtVerify(token, this.key, { audience, algorithms: ['HS256'] });
      return payload;
    } catch {
      return undefined;
    }
  }

  async openSession(res: Response, userId: number): Promise<void> {
    const token = await this.sign({ sub: String(userId) }, 'session', SESSION_DURATION_SECONDS);
    res.cookie(SESSION_COOKIE, token, this.cookieOptions(SESSION_DURATION_SECONDS));
  }

  async readSession(token: string | undefined): Promise<number | undefined> {
    const payload = await this.verify(token, 'session');
    const userId = Number(payload?.sub);
    return Number.isInteger(userId) ? userId : undefined;
  }

  closeSession(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(0), maxAge: undefined });
  }

  async saveOAuthTransaction(res: Response, transaction: OAuthTransaction): Promise<void> {
    const token = await this.sign({ ...transaction }, 'oauth', OAUTH_DURATION_SECONDS);
    res.cookie(OAUTH_COOKIE, token, this.cookieOptions(OAUTH_DURATION_SECONDS));
  }

  async takeOAuthTransaction(res: Response, token: string | undefined): Promise<OAuthTransaction | undefined> {
    res.clearCookie(OAUTH_COOKIE, { ...this.cookieOptions(0), maxAge: undefined });
    const payload = await this.verify(token, 'oauth');
    if (!payload) {
      return undefined;
    }
    const { provider, state, nonce, codeVerifier, returnTo } = payload;
    if ([provider, state, nonce, codeVerifier, returnTo].every((value) => typeof value === 'string')) {
      return { provider, state, nonce, codeVerifier, returnTo } as OAuthTransaction;
    }
    return undefined;
  }
}
