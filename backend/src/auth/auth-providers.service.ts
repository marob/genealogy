import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as oidc from 'openid-client';
import type { Env } from '../config/env.js';

/** Identité renvoyée par un fournisseur après authentification. */
export interface ExternalIdentity {
  provider: string;
  subject: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface AuthorizationRequest {
  url: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
}

interface ProviderDefinition {
  name: string;
  label: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  /** Découverte OIDC, ou métadonnées OAuth2 statiques (Facebook). */
  issuer?: URL;
  serverMetadata?: oidc.ServerMetadata;
  /** Lecture du profil pour les fournisseurs OAuth2 non OIDC. */
  fetchProfile?: (config: oidc.Configuration, accessToken: string) => Promise<Omit<ExternalIdentity, 'provider'>>;
}

const FACEBOOK_GRAPH = 'https://graph.facebook.com/v23.0';

async function fetchFacebookProfile(
  config: oidc.Configuration,
  accessToken: string,
): Promise<Omit<ExternalIdentity, 'provider'>> {
  const response = await oidc.fetchProtectedResource(
    config,
    accessToken,
    new URL(`${FACEBOOK_GRAPH}/me?fields=id,name,email,picture.type(large)`),
    'GET',
  );
  const profile = (await response.json()) as {
    id: string;
    name?: string;
    email?: string;
    picture?: { data?: { url?: string } };
  };
  return {
    subject: profile.id,
    // Facebook ne renvoie que des adresses confirmées.
    emailVerified: !!profile.email,
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.name ? { name: profile.name } : {}),
    ...(profile.picture?.data?.url ? { picture: profile.picture.data.url } : {}),
  };
}

@Injectable()
export class AuthProvidersService {
  private readonly definitions = new Map<string, ProviderDefinition>();
  private readonly configurations = new Map<string, Promise<oidc.Configuration>>();
  private readonly publicUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.publicUrl = config.get('PUBLIC_URL', { infer: true }).replace(/\/$/, '');
    const get = <K extends keyof Env>(key: K): Env[K] => config.get(key, { infer: true });

    const googleId = get('GOOGLE_CLIENT_ID');
    const googleSecret = get('GOOGLE_CLIENT_SECRET');
    if (googleId && googleSecret) {
      this.definitions.set('google', {
        name: 'google',
        label: 'Google',
        scope: 'openid email profile',
        clientId: googleId,
        clientSecret: googleSecret,
        issuer: new URL('https://accounts.google.com'),
      });
    }

    const facebookId = get('FACEBOOK_CLIENT_ID');
    const facebookSecret = get('FACEBOOK_CLIENT_SECRET');
    if (facebookId && facebookSecret) {
      this.definitions.set('facebook', {
        name: 'facebook',
        label: 'Facebook',
        scope: 'email public_profile',
        clientId: facebookId,
        clientSecret: facebookSecret,
        serverMetadata: {
          issuer: 'https://www.facebook.com',
          authorization_endpoint: 'https://www.facebook.com/v23.0/dialog/oauth',
          token_endpoint: `${FACEBOOK_GRAPH}/oauth/access_token`,
        },
        fetchProfile: fetchFacebookProfile,
      });
    }

    const oidcName = get('OIDC_NAME');
    const oidcIssuer = get('OIDC_ISSUER');
    const oidcId = get('OIDC_CLIENT_ID');
    const oidcSecret = get('OIDC_CLIENT_SECRET');
    if (oidcName && oidcIssuer && oidcId && oidcSecret) {
      this.definitions.set(oidcName, {
        name: oidcName,
        label: get('OIDC_LABEL') ?? oidcName,
        scope: 'openid email profile',
        clientId: oidcId,
        clientSecret: oidcSecret,
        issuer: new URL(oidcIssuer),
      });
    }
  }

  list(): { name: string; label: string }[] {
    return [...this.definitions.values()].map(({ name, label }) => ({ name, label }));
  }

  private definition(name: string): ProviderDefinition {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new NotFoundException(`Fournisseur d'identité inconnu : ${name}`);
    }
    return definition;
  }

  private configuration(definition: ProviderDefinition): Promise<oidc.Configuration> {
    let configuration = this.configurations.get(definition.name);
    if (!configuration) {
      configuration = definition.issuer
        ? oidc.discovery(definition.issuer, definition.clientId, definition.clientSecret)
        : Promise.resolve(
            new oidc.Configuration(definition.serverMetadata!, definition.clientId, definition.clientSecret),
          );
      // En cas d'échec (réseau…), on retentera au prochain appel.
      configuration.catch(() => this.configurations.delete(definition.name));
      this.configurations.set(definition.name, configuration);
    }
    return configuration;
  }

  callbackUrl(name: string): string {
    return `${this.publicUrl}/api/auth/${name}/callback`;
  }

  async authorizationRequest(name: string): Promise<AuthorizationRequest> {
    const definition = this.definition(name);
    const config = await this.configuration(definition);
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const parameters: Record<string, string> = {
      redirect_uri: this.callbackUrl(name),
      scope: definition.scope,
      state,
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    };
    if (!definition.fetchProfile) {
      parameters.nonce = nonce;
    }
    return { url: oidc.buildAuthorizationUrl(config, parameters), state, nonce, codeVerifier };
  }

  async handleCallback(
    name: string,
    currentUrl: URL,
    checks: { state: string; nonce: string; codeVerifier: string },
  ): Promise<ExternalIdentity> {
    const definition = this.definition(name);
    const config = await this.configuration(definition);
    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      ...(definition.fetchProfile ? {} : { expectedNonce: checks.nonce, idTokenExpected: true }),
    });

    if (definition.fetchProfile) {
      return { provider: name, ...(await definition.fetchProfile(config, tokens.access_token)) };
    }

    const claims = tokens.claims()!;
    const info = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub).catch(() => undefined);
    const merged = { ...claims, ...info };
    const text = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
    const email = text(merged.email);
    const displayName = text(merged.name);
    const picture = text(merged.picture);
    return {
      provider: name,
      subject: claims.sub,
      emailVerified: merged.email_verified === true,
      ...(email ? { email } : {}),
      ...(displayName ? { name: displayName } : {}),
      ...(picture ? { picture } : {}),
    };
  }
}
