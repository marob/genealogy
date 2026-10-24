# Genealogy

Web application for browsing a family tree, fed by a **GEDCOM** file exported from genealogy software (Heredis, Gramps, Geneatique…).

- Interactive tree (zoom, pan, expanding ancestors and descendants), detailed profile for each person.
- Search by name, place, birth period and sex; surname index.
- GEDCOM import with a preview before applying and a history (you can go back to a previous import).
- User interface in French, English and Spanish.
- OpenID Connect authentication (Google, Facebook, or any OIDC provider) and permission management.

## Privacy: the 100-year rule

| Profile                                        | People born more than 100 years ago | People born less than 100 years ago |
| ---------------------------------------------- | ----------------------------------- | ----------------------------------- |
| Anonymous visitor, or signed in without rights | Everything                          | Name and family links only          |
| Signed in with the "contemporaries" permission | Everything                          | Everything                          |
| Administrator                                  | Everything                          | Everything + import and accounts    |

The rule is enforced **on the server**: hidden information never leaves the API.

- An unknown birth date is estimated from the person's events (one is born before marrying or dying), and from their parents, spouses and children. When no estimate is possible, the person is treated as a contemporary.
- Searches by place or date exclude contemporaries for unauthorized users, so that nothing is revealed indirectly.
- "Today" is computed in the `APP_TIMEZONE` time zone (Europe/Paris by default).

## GEDCOM import

- **Encodings**: UTF-8 (with or without BOM), UTF-16 LE/BE, ANSEL (diacritics recomposed into Unicode), ANSI/Windows-1252, Macintosh. The declared encoding (`1 CHAR`) is checked, and common inconsistencies are fixed and reported.
- **Dates**: partial dates (`MAR 1850`, `1850`), approximate (`ABT`, `EST`, `CAL`), bounded (`BEF`, `AFT`, `BET … AND …`, `FROM … TO …`), free text, dual years (`1720/21`), **Gregorian, Julian, French Republican** and Hebrew calendars. They are never converted to a `Date` object: no time-zone shift, neither on import nor on display.
- **Places**: split according to the declared format (`HEAD.PLAC.FORM`) or the common "City, Code, County, Region, Country" format, GPS coordinates.
- The original file is kept with each import; warnings (broken references, unrecognized dates, information not imported) are shown before committing.

## Architecture

```
shared/     API contract (shared TypeScript types)
backend/    NestJS API + Prisma + SQLite
frontend/   Angular application (CDK, Transloco, Font Awesome)
e2e/        Playwright end-to-end tests
docker/     Image startup script
```

A single Docker image contains the API and the built frontend. The SQLite database is stored in the `/data` volume.

## Development

Prerequisites: Node.js (version in [`.nvmrc`](.nvmrc), via `nvm use`) and npm.

```bash
nvm use
npm install
cp backend/.env.example backend/.env
npm run prisma:migrate -w @genealogie/backend
```

Then, in two terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

The application is served at http://localhost:4200 (`/api` calls are proxied to the backend on port 3000).
With `AUTH_DEV_BYPASS=true` in `backend/.env`, every visitor is an administrator: handy for importing a file without configuring an OIDC provider. This mode is rejected at startup if `PUBLIC_URL` does not point to `localhost`.

`.ged` files and databases are excluded from Git. The `private/` folder (ignored) can hold your real test files.

### Quality

```bash
npm run check
```

This command runs Prettier, ESLint (strict TypeScript, Angular, template accessibility), type checking, [knip](https://knip.dev) (dead code, unused exports and dependencies) and the unit and integration tests (Vitest).
The end-to-end tests build the application and then drive it with Playwright:

```bash
npx -w @genealogie/e2e playwright install chromium
npm run test:e2e
```

A Git hook (husky + lint-staged) formats and fixes the changed files on each commit.

## Running with Docker

```bash
cp .env.example .env
docker compose up --build
```

The application is available at http://localhost:8080. At a minimum, set `SESSION_SECRET` (32 characters or more) in `.env`.

Multi-architecture image (for example for an Oracle Cloud ARM server):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t genealogie .
```

### Deployment

CI publishes the multi-architecture image `ghcr.io/marob/genealogy` on every commit to `main` whose tests pass. The [`deploy/`](deploy) folder contains the production `docker-compose.yml` (listening on `127.0.0.1:3100`), a `.env.example` and the nginx site (HTTPS via certbot):

```bash
docker compose pull && docker compose up -d
```

### Configuration

| Variable                                                                         | Purpose                                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `PUBLIC_URL`                                                                     | Public URL of the application (OIDC callbacks, secure cookies over HTTPS)           |
| `SESSION_SECRET`                                                                 | Session signing secret (at least 32 characters)                                     |
| `ADMIN_EMAILS`                                                                   | E-mails promoted to administrator when they sign in (comma-separated)               |
| `AUTH_DEV_BYPASS`                                                                | Disables authentication (everyone is an admin); localhost only                      |
| `APP_TIMEZONE`                                                                   | Reference time zone for the 100-year rule                                           |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                      | Google sign-in                                                                      |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`                                  | Facebook sign-in                                                                    |
| `OIDC_NAME`, `OIDC_LABEL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Generic OpenID Connect provider (Keycloak, Microsoft…)                              |
| `OIDC_TRUST_EMAIL`                                                               | Accepts the generic provider's e-mail without an `email_verified` claim (Microsoft) |

The redirect URI to register with each provider is `${PUBLIC_URL}/api/auth/<provider>/callback`.

Personal Microsoft accounts (Outlook, Hotmail, Live) through the generic provider: register the application on portal.azure.com ("Personal Microsoft accounts only", Web platform), then:

```bash
OIDC_NAME=microsoft
OIDC_LABEL=Microsoft
OIDC_ISSUER=https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0
OIDC_TRUST_EMAIL=true
```

The `…/consumers/v2.0` URL does not work: the issuer declared in its metadata does not match. Since Microsoft does not send `email_verified`, `OIDC_TRUST_EMAIL` is required; do not enable it for a provider where users can declare an arbitrary address.

## License

[MIT](LICENSE).
