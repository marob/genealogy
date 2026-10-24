import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().startsWith('file:'),
  PUBLIC_URL: z.url().default('http://localhost:4200'),
  SESSION_SECRET: z.string().min(32),
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  AUTH_DEV_BYPASS: booleanString,
  /** Format des journaux : JSON (production) ou lisible (développement). */
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  /** Fuseau horaire de référence pour « aujourd'hui » (règle des 100 ans). */
  APP_TIMEZONE: z.string().default('Europe/Paris'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),
  /** Fournisseur OpenID Connect générique (Keycloak, Microsoft, Authelia…). */
  OIDC_NAME: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  OIDC_LABEL: z.string().optional(),
  OIDC_ISSUER: z.url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  /** Dossier contenant le build du frontend, servi en statique (image Docker). */
  STATIC_DIR: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function validateEnv(config: Record<string, unknown>): Env {
  // Une variable vide (« FOO= ») équivaut à une variable absente.
  const env = envSchema.parse(Object.fromEntries(Object.entries(config).filter(([, value]) => value !== '')));
  // Garde-fou : le mode sans authentification n'est possible qu'en local.
  if (env.AUTH_DEV_BYPASS && !LOCAL_HOSTS.has(new URL(env.PUBLIC_URL).hostname)) {
    throw new Error('AUTH_DEV_BYPASS ne peut être activé que si PUBLIC_URL pointe vers localhost.');
  }
  return env;
}
