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
  SESSION_SECRET: z
    .string()
    .min(32)
    .refine((secret) => !secret.startsWith('change-me'), 'SESSION_SECRET still has the example value.'),
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
  /** Log format: JSON (production) or human-readable (development). */
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  /** Reference time zone for "today" (100-year rule). */
  APP_TIMEZONE: z.string().default('Europe/Paris'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),
  /** Generic OpenID Connect provider (Keycloak, Microsoft, Authelia...). */
  OIDC_NAME: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  OIDC_LABEL: z.string().optional(),
  OIDC_ISSUER: z.url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  /**
   * Treats the generic provider's email as verified even without an
   * `email_verified` claim (Microsoft does not send it). Only for a provider
   * that does not let its users pick an arbitrary address.
   */
  OIDC_TRUST_EMAIL: booleanString,
  /** Contact address shown on the privacy policy page. */
  CONTACT_EMAIL: z.email().optional(),
  /** Directory containing the frontend build, served statically (Docker image). */
  STATIC_DIR: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function validateEnv(config: Record<string, unknown>): Env {
  // An empty variable ("FOO=") is the same as a missing one.
  const env = envSchema.parse(Object.fromEntries(Object.entries(config).filter(([, value]) => value !== '')));
  // Safeguard: the no-authentication mode is only allowed locally.
  if (env.AUTH_DEV_BYPASS && !LOCAL_HOSTS.has(new URL(env.PUBLIC_URL).hostname)) {
    throw new Error('AUTH_DEV_BYPASS can only be enabled if PUBLIC_URL points to localhost.');
  }
  return env;
}
