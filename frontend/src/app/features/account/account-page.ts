import { DatePipe } from '@angular/common';
import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { NotificationsService } from '../../core/notifications.service';
import { isLanguage, LANGUAGES, LanguageService } from '../../core/language.service';
import { SessionStore } from '../../core/session.store';

@Component({
  selector: 'app-account-page',
  imports: [TranslocoPipe, DatePipe, RouterLink],
  template: `
    <h1>{{ 'nav.account' | transloco }}</h1>
    <section class="card">
      <h2>{{ 'account.preferences' | transloco }}</h2>
      <label class="field language">
        <span>{{ 'nav.language' | transloco }}</span>
        <select (change)="changeLanguage($any($event.target).value)">
          @for (code of languages; track code) {
            <option [value]="code" [selected]="code === lang()">{{ 'languages.' + code | transloco }}</option>
          }
        </select>
      </label>
    </section>
    @if (session.user(); as user) {
      <section class="card">
        <div class="profile">
          @if (user.avatarUrl) {
            <img [src]="user.avatarUrl" alt="" width="64" height="64" referrerpolicy="no-referrer" />
          }
          <div>
            <h1>{{ user.displayName ?? user.email }}</h1>
            <p class="muted">{{ user.email }}</p>
          </div>
        </div>
        <dl>
          <dt>{{ 'account.role' | transloco }}</dt>
          <dd>{{ 'roles.' + user.role | transloco }}</dd>
          <dt>{{ 'account.rights' | transloco }}</dt>
          <dd>
            {{
              (session.canSeeContemporary() ? 'account.canSeeContemporary' : 'account.cannotSeeContemporary')
                | transloco
            }}
          </dd>
          <dt>{{ 'account.memberSince' | transloco }}</dt>
          <dd>{{ user.createdAt | date: 'longDate' : undefined : lang() }}</dd>
          <dt>{{ 'account.root' | transloco }}</dt>
          <dd class="root">
            @if (rootPerson.value(); as root) {
              <a [routerLink]="['/tree', root.id]"
                ><span class="surname">{{ root.surname }}</span> {{ root.givenNames }}</a
              >
              <button type="button" class="btn btn-small btn-text" (click)="resetRoot()">
                {{ 'account.resetRoot' | transloco }}
              </button>
            } @else {
              {{ 'account.globalRoot' | transloco }}
              <div class="muted">{{ 'account.rootHint' | transloco }}</div>
            }
          </dd>
        </dl>
        @if (!session.canSeeContemporary()) {
          <p class="hint">{{ 'account.askAdmin' | transloco }}</p>
        }
      </section>
    } @else {
      <section class="card">
        <p>{{ 'account.loginPrompt' | transloco }}</p>
        <a class="btn btn-primary" routerLink="/login" [queryParams]="{ returnTo: '/account' }">{{
          'nav.login' | transloco
        }}</a>
      </section>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      width: min(40rem, 100%);
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    h1 {
      margin: 0;
    }
    .language {
      max-width: 16rem;
    }
    .profile {
      display: flex;
      align-items: center;
      gap: 1rem;
      img {
        border-radius: 50%;
      }
      h1 {
        margin: 0;
      }
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.5rem 1.5rem;
      margin-top: 1.5rem;
    }
    dt {
      color: var(--text-muted);
    }
    dd {
      margin: 0;
    }
    .root {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.75rem;
    }
    .surname {
      text-transform: uppercase;
    }
    .hint {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
  `,
})
export class AccountPage {
  protected readonly session = inject(SessionStore);
  private readonly language = inject(LanguageService);
  protected readonly lang = this.language.current;
  protected readonly languages = LANGUAGES;

  protected changeLanguage(value: string): void {
    if (isLanguage(value)) {
      this.language.use(value);
    }
  }
  private readonly api = inject(ApiService);
  private readonly notifications = inject(NotificationsService);

  /** Racine personnelle (une racine qui n'existe plus après un import est ignorée). */
  protected readonly rootPerson = resource({
    params: () => this.session.user()?.rootPersonId,
    loader: ({ params }) => this.api.person(params).catch(() => undefined),
  });

  protected async resetRoot(): Promise<void> {
    await this.session.setPersonalRoot(null);
    this.notifications.show('success', 'account.rootReset');
  }
}
