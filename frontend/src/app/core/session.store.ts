import { computed, inject, Injectable, signal } from '@angular/core';
import type { MeDto } from '@genealogie/shared';
import { ApiService } from './api.service';
import { LanguageService } from './language.service';

/** Session state (signed-in user, identity providers). */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiService);
  private readonly language = inject(LanguageService).current;
  private readonly state = signal<MeDto>({ providers: [], devBypass: false, contemporaryPrivacy: 'names' });

  readonly user = computed(() => this.state().user);
  readonly providers = computed(() => this.state().providers);
  readonly devBypass = computed(() => this.state().devBypass);
  readonly contactEmail = computed(() => this.state().contactEmail);

  /** Configured identity providers as a sentence fragment ("Google or Microsoft"), for the texts. */
  readonly providerList = computed(() => {
    const labels = this.providers().map((provider) => provider.label);
    return labels.length
      ? new Intl.ListFormat(this.language(), { type: 'disjunction' }).format(labels)
      : 'OpenID Connect';
  });
  readonly contemporaryPrivacy = computed(() => this.state().contemporaryPrivacy);
  readonly isAuthenticated = computed(() => !!this.user());
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  readonly canSeeContemporary = computed(() => this.isAdmin() || !!this.user()?.canSeeContemporary);

  async load(): Promise<void> {
    try {
      this.state.set(await this.api.me());
    } catch {
      // API unavailable: the application remains usable anonymously.
    }
  }

  /** Redirects to the identity provider (flow handled by the backend). */
  login(provider: string, returnTo = '/'): void {
    window.location.assign(`/api/auth/${encodeURIComponent(provider)}/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async setPersonalRoot(personId: string | null): Promise<void> {
    await this.api.setMyRoot(personId);
    await this.load();
  }

  async deleteAccount(): Promise<void> {
    await this.api.deleteMe();
    this.api.clearCache();
    await this.load();
  }

  async logout(): Promise<void> {
    await this.api.logout();
    this.api.clearCache();
    await this.load();
  }
}
