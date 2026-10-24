import { join } from 'node:path';
import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { HealthController } from './health/health.controller.js';
import { ImportsModule } from './imports/imports.module.js';
import { PersonsModule } from './persons/persons.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

/** In production (Docker image), the backend also serves the frontend build. */
function staticModules(): DynamicModule[] {
  const staticDir = process.env.STATIC_DIR;
  if (!staticDir) {
    return [];
  }
  return [
    ServeStaticModule.forRoot({
      rootPath: join(staticDir),
      exclude: ['/api/{*path}'],
    }),
  ];
}

/** Drops the query string (OAuth code and state) of the authentication routes. */
function withoutAuthQuery(req: { url?: string; query?: unknown }): unknown {
  if (req.url?.startsWith('/api/auth/')) {
    return { ...req, url: req.url.split('?')[0], query: {} };
  }
  return req;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        transport: process.env.LOG_FORMAT === 'pretty' ? { target: 'pino-pretty' } : undefined,
        // Session and OAuth cookies, OAuth codes: never in the logs.
        redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        serializers: { req: withoutAuthQuery },
      },
    }),
    PrismaModule,
    AuthModule,
    ImportsModule,
    PersonsModule,
    ...staticModules(),
  ],
  controllers: [HealthController],
})
export class AppModule {}
