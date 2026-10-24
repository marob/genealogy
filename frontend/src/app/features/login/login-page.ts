import { Component, inject, input } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faFacebook, faGoogle, faMicrosoft, faOpenid } from '@fortawesome/free-brands-svg-icons';
import { TranslocoPipe } from '@jsverse/transloco';
import { SessionStore } from '../../core/session.store';

const PROVIDER_ICONS: Record<string, typeof faGoogle> = {
  google: faGoogle,
  facebook: faFacebook,
  microsoft: faMicrosoft,
};

/** Sign-in through the identity providers configured on the server. */
@Component({
  selector: 'app-login-page',
  imports: [FaIconComponent, TranslocoPipe],
  template: `
    <div class="card login">
      <h1>{{ 'login.title' | transloco }}</h1>
      <p>{{ 'login.intro' | transloco }}</p>
      @if (error()) {
        <p class="error" role="alert">{{ 'login.errors.' + error() | transloco }}</p>
      }
      @if (session.isAuthenticated()) {
        <p>{{ 'login.already' | transloco: { email: session.user()?.email } }}</p>
      } @else {
        <div class="providers">
          @for (provider of session.providers(); track provider.name) {
            <button
              type="button"
              class="btn provider"
              [class]="'btn provider provider-' + provider.name"
              (click)="session.login(provider.name, returnTo() ?? '/')"
            >
              <fa-icon [icon]="icon(provider.name)" />
              {{ 'login.with' | transloco: { provider: provider.label } }}
            </button>
          } @empty {
            <p class="muted">{{ 'login.noProvider' | transloco }}</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      padding: 3rem 1rem;
    }
    .login {
      width: min(26rem, 100%);
      text-align: center;
    }
    .providers {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }
    .provider {
      justify-content: center;
    }
  `,
})
export class LoginPage {
  readonly error = input<string>();
  readonly returnTo = input<string>();
  protected readonly session = inject(SessionStore);

  protected icon(provider: string) {
    return PROVIDER_ICONS[provider] ?? faOpenid;
  }
}
