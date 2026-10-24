import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Configuration commune à l'application réelle et aux tests d'intégration. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableShutdownHooks();
}
