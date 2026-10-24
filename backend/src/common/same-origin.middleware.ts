import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection on top of SameSite=Lax cookies: any state-changing request
 * carrying an Origin header must come from the application: either the
 * configured public URL, or the host the request is addressed to (case of a
 * development server or a proxy on another port).
 */
@Injectable()
export class SameOriginMiddleware implements NestMiddleware {
  private readonly allowedOrigin: string;

  constructor(config: ConfigService<Env, true>) {
    this.allowedOrigin = new URL(config.get('PUBLIC_URL', { infer: true })).origin;
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin && !this.isAllowed(origin, req.headers.host)) {
      throw new ForbiddenException('Request origin not allowed.');
    }
    next();
  }

  private isAllowed(origin: string, host: string | undefined): boolean {
    if (origin === this.allowedOrigin) {
      return true;
    }
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
}
