import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NotificationsService } from './core/notifications.service';
import { SessionStore } from './core/session.store';
import { iconLogout, iconSettings } from './ui/icons';
import { QuickSearch } from './ui/quick-search';
import { Toasts } from './ui/toasts';
import { switchMap } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FaIconComponent, TranslocoPipe, Toasts, QuickSearch],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationsService);
  protected readonly icons = { iconLogout, iconSettings };

  constructor() {
    const title = inject(Title);
    const transloco = inject(TranslocoService);
    transloco.langChanges$
      .pipe(
        switchMap(() => transloco.selectTranslate<string>('app.title')),
        takeUntilDestroyed(),
      )
      .subscribe((text) => title.setTitle(text));
  }

  protected async logout(): Promise<void> {
    try {
      await this.session.logout();
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.notifications.error(error);
    }
  }
}
