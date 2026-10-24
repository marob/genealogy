import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** Configuration commune à l'application réelle et aux tests d'intégration. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableShutdownHooks();
}
