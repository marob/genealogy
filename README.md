# Généalogie

Application web de consultation d'un arbre généalogique, alimentée par un fichier **GEDCOM** exporté depuis un logiciel de généalogie (Heredis, Gramps, Geneatique…).

- Arbre interactif (zoom, déplacement, dépliage des ascendants et descendants), fiche détaillée par personne.
- Recherche par nom, lieu, période de naissance et sexe ; index des patronymes.
- Import GEDCOM avec aperçu avant application et historique (retour possible à un import précédent).
- Interface en français, anglais et espagnol.
- Authentification OpenID Connect (Google, Facebook, ou tout fournisseur OIDC) et gestion des droits.

## Confidentialité : la règle des 100 ans

| Profil                                   | Personnes nées il y a plus de 100 ans | Personnes nées il y a moins de 100 ans |
| ---------------------------------------- | ------------------------------------- | -------------------------------------- |
| Visiteur anonyme ou connecté sans droit  | Tout                                  | Nom et liens familiaux uniquement      |
| Connecté avec le droit « contemporains » | Tout                                  | Tout                                   |
| Administrateur                           | Tout                                  | Tout + import et gestion des comptes   |

La règle est appliquée **côté serveur** : les informations masquées ne quittent jamais l'API.

- Une date de naissance inconnue est estimée à partir des événements de la personne (on naît avant de se marier ou de mourir), de ses parents, conjoints et enfants. Sans estimation possible, la personne est traitée comme contemporaine.
- Les recherches par lieu ou par date excluent les contemporains pour les utilisateurs non autorisés, afin de ne rien révéler indirectement.
- « Aujourd'hui » est calculé dans le fuseau `APP_TIMEZONE` (Europe/Paris par défaut).

## Import GEDCOM

- **Encodages** : UTF-8 (avec ou sans BOM), UTF-16 LE/BE, ANSEL (diacritiques recomposés en Unicode), ANSI/Windows-1252, Macintosh. L'encodage déclaré (`1 CHAR`) est vérifié et les incohérences courantes sont corrigées et signalées.
- **Dates** : dates partielles (`MAR 1850`, `1850`), approximatives (`ABT`, `EST`, `CAL`), bornées (`BEF`, `AFT`, `BET … AND …`, `FROM … TO …`), textes libres, années doubles (`1720/21`), calendriers **grégorien, julien, républicain français** et hébreu. Elles ne sont jamais converties en objet `Date` : aucun décalage de fuseau horaire, ni à l'import ni à l'affichage.
- **Lieux** : découpage selon le format déclaré (`HEAD.PLAC.FORM`) ou le format courant « Ville, Code, Département, Région, Pays », coordonnées GPS.
- Le fichier d'origine est conservé avec chaque import ; les avertissements (références cassées, dates non reconnues, informations non importées) sont affichés avant validation.

## Architecture

```
shared/     Contrat d'API (types TypeScript partagés)
backend/    API NestJS + Prisma + SQLite
frontend/   Application Angular (CDK, Transloco, Font Awesome)
e2e/        Tests de bout en bout Playwright
docker/     Script de démarrage de l'image
```

Une seule image Docker contient l'API et le frontend compilé. La base SQLite est stockée dans le volume `/data`.

## Développement

Prérequis : Node.js (version dans [`.nvmrc`](.nvmrc), via `nvm use`) et npm.

```bash
nvm use
npm install
cp backend/.env.example backend/.env
npm run prisma:migrate -w @genealogie/backend
```

Puis, dans deux terminaux :

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

L'application est servie sur http://localhost:4200 (les appels `/api` sont relayés vers le backend sur le port 3000).
Avec `AUTH_DEV_BYPASS=true` dans `backend/.env`, tout visiteur est administrateur : pratique pour importer un fichier sans configurer de fournisseur OIDC. Ce mode est refusé au démarrage si `PUBLIC_URL` ne pointe pas vers `localhost`.

Les fichiers `.ged` et les bases de données sont exclus de Git. Le dossier `private/` (ignoré) peut accueillir vos fichiers de test réels.

### Qualité

```bash
npm run check
```

Cette commande enchaîne Prettier, ESLint (TypeScript strict, Angular, accessibilité des templates), la vérification des types, [knip](https://knip.dev) (code mort, exports et dépendances inutilisés) et les tests unitaires et d'intégration (Vitest).
Les tests de bout en bout compilent l'application puis la pilotent avec Playwright :

```bash
npx -w @genealogie/e2e playwright install chromium
npm run test:e2e
```

Un hook Git (husky + lint-staged) formate et corrige les fichiers modifiés à chaque commit.

## Exécution avec Docker

```bash
cp .env.example .env
docker compose up --build
```

L'application est disponible sur http://localhost:8080. Renseignez au minimum `SESSION_SECRET` (32 caractères ou plus) dans `.env`.

Image multi-architecture (par exemple pour un serveur ARM Oracle Cloud) :

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t genealogie .
```

### Déploiement

La CI publie l'image multi-architecture `ghcr.io/marob/genealogy` à chaque commit sur `main` dont les tests passent. Le dossier [`deploy/`](deploy) contient le `docker-compose.yml` de production (écoute sur `127.0.0.1:3100`), un `.env.example` et le site nginx (HTTPS via certbot) :

```bash
docker compose pull && docker compose up -d
```

### Configuration

| Variable                                                                         | Rôle                                                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `PUBLIC_URL`                                                                     | URL publique de l'application (callbacks OIDC, cookies sécurisés en HTTPS)        |
| `SESSION_SECRET`                                                                 | Secret de signature des sessions (32 caractères minimum)                          |
| `ADMIN_EMAILS`                                                                   | E-mails promus administrateurs à leur connexion (séparés par des virgules)        |
| `AUTH_DEV_BYPASS`                                                                | Désactive l'authentification (tout le monde est admin) ; uniquement sur localhost |
| `APP_TIMEZONE`                                                                   | Fuseau de référence pour la règle des 100 ans                                     |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                      | Connexion Google                                                                  |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`                                  | Connexion Facebook                                                                |
| `OIDC_NAME`, `OIDC_LABEL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Fournisseur OpenID Connect générique (Keycloak, Microsoft…)                       |

L'URI de redirection à déclarer chez chaque fournisseur est `${PUBLIC_URL}/api/auth/<fournisseur>/callback`.

## Licence

[MIT](LICENSE).
