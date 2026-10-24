import { DatePipe } from '@angular/common';
import { Component, inject, resource } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { Role, UserDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { LanguageService } from '../../core/language.service';
import { NotificationsService } from '../../core/notifications.service';
import { SessionStore } from '../../core/session.store';
import { ConfirmService } from '../../ui/confirm-dialog';
import { iconDelete } from '../../ui/icons';

/** Gestion des comptes : rôle et droit de voir les contemporains. */
@Component({
  selector: 'app-users-admin',
  imports: [FaIconComponent, TranslocoPipe, DatePipe],
  template: `
    <section class="card">
      <h2>{{ 'admin.users.title' | transloco }}</h2>
      <p class="muted">{{ 'admin.users.intro' | transloco }}</p>
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">{{ 'admin.users.user' | transloco }}</th>
              <th scope="col">{{ 'account.role' | transloco }}</th>
              <th scope="col">{{ 'admin.users.contemporary' | transloco }}</th>
              <th scope="col">{{ 'admin.users.lastLogin' | transloco }}</th>
              <th scope="col">
                <span class="sr-only">{{ 'common.actions' | transloco }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            @for (user of users.value(); track user.id) {
              @let self = user.id === session.user()?.id;
              <tr>
                <td>
                  {{ user.displayName ?? user.email }}
                  <div class="muted">{{ user.email }}</div>
                </td>
                <td>
                  <select
                    [value]="user.role"
                    [disabled]="self"
                    [attr.aria-label]="'account.role' | transloco"
                    (change)="update(user, { role: $any($event.target).value })"
                  >
                    <option value="MEMBER">{{ 'roles.MEMBER' | transloco }}</option>
                    <option value="ADMIN">{{ 'roles.ADMIN' | transloco }}</option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    [checked]="user.canSeeContemporary || user.role === 'ADMIN'"
                    [disabled]="user.role === 'ADMIN'"
                    [attr.aria-label]="'admin.users.contemporary' | transloco"
                    (change)="update(user, { canSeeContemporary: $any($event.target).checked })"
                  />
                </td>
                <td>{{ user.lastLoginAt | date: 'short' : undefined : lang() }}</td>
                <td class="row-actions">
                  @if (!self) {
                    <button
                      type="button"
                      class="btn-icon"
                      [attr.aria-label]="'common.delete' | transloco"
                      (click)="remove(user)"
                    >
                      <fa-icon [icon]="iconDelete" />
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="muted">{{ 'admin.users.none' | transloco }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class UsersAdmin {
  private readonly api = inject(ApiService);
  private readonly notifications = inject(NotificationsService);
  private readonly confirmService = inject(ConfirmService);
  protected readonly session = inject(SessionStore);
  protected readonly lang = inject(LanguageService).current;

  protected readonly users = resource({ loader: () => this.api.users() });

  protected async update(user: UserDto, changes: { role?: Role; canSeeContemporary?: boolean }): Promise<void> {
    try {
      await this.api.updateUser(user.id, changes);
      this.notifications.show('success', 'admin.users.updated');
    } catch (error) {
      this.notifications.error(error);
    }
    this.users.reload();
  }

  protected async remove(user: UserDto): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'admin.users.deleteTitle',
      message: 'admin.users.deleteMessage',
      params: { email: user.email },
      confirmLabel: 'common.delete',
      danger: true,
    });
    if (confirmed) {
      await this.api.deleteUser(user.id);
      this.users.reload();
    }
  }

  protected readonly iconDelete = iconDelete;
}
