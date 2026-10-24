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

/** En production (image Docker), le backend sert aussi le build du frontend. */
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
        redact: ['req.headers.cookie', 'req.headers.authorization'],
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
