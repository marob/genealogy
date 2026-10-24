import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** Configuration shared by the real application and the integration tests. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableShutdownHooks();
}
