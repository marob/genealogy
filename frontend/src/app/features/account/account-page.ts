import { DatePipe } from '@angular/common';
import { Component, computed, inject, resource } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { NotificationsService } from '../../core/notifications.service';
import { isLanguage, LANGUAGES, LanguageService } from '../../core/language.service';
import { valueOf } from '../../core/resources';
import { SessionStore } from '../../core/session.store';
import { ConfirmService } from '../../ui/confirm-dialog';
import { PersonName } from '../../ui/person-name';
import { isNameOrder, NAME_ORDERS, NameOrderService } from '../../core/name-order.service';

@Component({
  selector: 'app-account-page',
  imports: [PersonName, TranslocoPipe, DatePipe, RouterLink],
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
      <label class="field language">
        <span>{{ 'account.nameOrder' | transloco }}</span>
        <select (change)="changeNameOrder($any($event.target).value)">
          @for (order of nameOrders; track order) {
            <option [value]="order" [selected]="order === nameOrder()">
              {{ 'account.nameOrders.' + order | transloco }}
            </option>
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
            <h2>{{ user.displayName ?? user.email }}</h2>
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
            @if (rootValue(); as root) {
              <a [routerLink]="['/tree', root.id]">
                <app-person-name [person]="root" />
              </a>
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
      <section class="card">
        <h2>{{ 'account.deleteTitle' | transloco }}</h2>
        <p class="hint">{{ 'account.deleteIntro' | transloco: { providers: session.providerList() } }}</p>
        <button type="button" class="btn btn-danger" (click)="deleteAccount()">
          {{ 'account.deleteButton' | transloco }}
        </button>
      </section>
    } @else {
      <section class="card">
        <p>{{ 'account.loginPrompt' | transloco }}</p>
        <a class="btn btn-primary" routerLink="/login" [queryParams]="{ returnTo: '/account' }">{{
          'nav.login' | transloco
        }}</a>
      </section>
    }
    <nav class="legal" [attr.aria-label]="'nav.legal' | transloco">
      <a routerLink="/privacy">{{ 'nav.privacy' | transloco }}</a>
      <a routerLink="/terms">{{ 'nav.terms' | transloco }}</a>
    </nav>
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
      h2 {
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
    .hint {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .legal {
      display: flex;
      justify-content: center;
      gap: 1.5rem;
      font-size: 0.9rem;
    }
  `,
})
export class AccountPage {
  protected readonly session = inject(SessionStore);
  private readonly language = inject(LanguageService);
  protected readonly lang = this.language.current;
  protected readonly languages = LANGUAGES;

  private readonly names = inject(NameOrderService);
  protected readonly nameOrder = this.names.current;
  protected readonly nameOrders = NAME_ORDERS;

  protected changeNameOrder(value: string): void {
    if (isNameOrder(value)) {
      this.names.use(value);
    }
  }

  protected changeLanguage(value: string): void {
    if (isLanguage(value)) {
      this.language.use(value);
    }
  }
  private readonly api = inject(ApiService);
  private readonly notifications = inject(NotificationsService);
  private readonly confirmService = inject(ConfirmService);
  private readonly router = inject(Router);

  /** Personal root (a root that no longer exists after an import is ignored). */
  protected readonly rootPerson = resource({
    params: () => this.session.user()?.rootPersonId,
    loader: ({ params }) => this.api.person(params).catch(() => undefined),
  });

  protected readonly rootValue = computed(() => valueOf(this.rootPerson));

  protected async resetRoot(): Promise<void> {
    try {
      await this.session.setPersonalRoot(null);
      this.notifications.show('success', 'account.rootReset');
    } catch (error) {
      this.notifications.error(error);
    }
  }

  protected async deleteAccount(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'account.deleteConfirmTitle',
      message: 'account.deleteConfirmMessage',
      confirmLabel: 'common.delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.session.deleteAccount();
    } catch (error) {
      this.notifications.error(error);
      return;
    }
    this.notifications.show('success', 'account.deleted');
    await this.router.navigateByUrl('/');
  }
}
