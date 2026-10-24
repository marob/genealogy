import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF en complément des cookies SameSite=Lax : toute requête
 * modifiante portant un en-tête Origin doit provenir de l'application : soit
 * l'URL publique configurée, soit l'hôte auquel la requête est adressée (cas
 * d'un serveur de développement ou d'un proxy sur un autre port).
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
      throw new ForbiddenException('Origine de la requête non autorisée.');
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
