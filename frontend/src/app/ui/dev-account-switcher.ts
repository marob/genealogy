import { DOCUMENT } from '@angular/common';
import { Component, inject, resource } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../core/api.service';
import { valueOf } from '../core/resources';
import { SessionStore } from '../core/session.store';

/**
 * Development mode only: badge with a choice of test account (administrator,
 * members), to see the site — and the proposals — as different users.
 */
@Component({
  selector: 'app-dev-account-switcher',
  imports: [TranslocoPipe],
  template: `
    <label class="badge badge-warning" [title]="'app.devBypassHint' | transloco">
      {{ 'app.devBypass' | transloco }}
      <select [attr.aria-label]="'app.devAccount' | transloco" (change)="switch($any($event.target).value)">
        @for (account of accounts(); track account.email) {
          <option [value]="account.email" [selected]="account.email === session.user()?.email">
            {{ account.name }}
          </option>
        }
      </select>
    </label>
  `,
  styles: `
    label {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    select {
      max-width: 14rem;
      padding: 0.1rem 0.3rem;
      font-size: 0.8rem;
    }
  `,
})
export class DevAccountSwitcher {
  private readonly api = inject(ApiService);
  private readonly document = inject(DOCUMENT);
  protected readonly session = inject(SessionStore);
  private readonly list = resource({ loader: () => this.api.devAccounts() });
  protected readonly accounts = () => valueOf(this.list) ?? [];

  /** Opens a session as that account, then reloads everything (caches, tree, overlay). */
  protected async switch(email: string): Promise<void> {
    await this.api.devLogin(email);
    this.reloadPage();
  }

  protected reloadPage(): void {
    this.document.defaultView?.location.reload();
  }
}
