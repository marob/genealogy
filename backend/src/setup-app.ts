import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Configuration shared by the real application and the integration tests. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Profile pictures come from the identity providers (Google, Facebook…).
          'img-src': ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );
  app.use(cookieParser());
  app.enableShutdownHooks();
}
