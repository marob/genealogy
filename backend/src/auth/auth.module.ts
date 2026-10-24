import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SameOriginMiddleware } from '../common/same-origin.middleware.js';
import { UsersController } from '../users/users.controller.js';
import { UsersService } from '../users/users.service.js';
import { AuthProvidersService } from './auth-providers.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController, UsersController],
  providers: [AuthProvidersService, SessionService, UsersService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [SessionService, UsersService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SameOriginMiddleware).forRoutes('{*path}');
  }
}
