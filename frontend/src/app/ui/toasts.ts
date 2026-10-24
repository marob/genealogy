import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationsService } from '../core/notifications.service';

@Component({
  selector: 'app-toasts',
  imports: [TranslocoPipe],
  template: `
    @for (item of notifications.items(); track item.id) {
      <div class="toast" [class]="'toast toast-' + item.kind" [attr.role]="item.kind === 'error' ? 'alert' : 'status'">
        <span>{{ item.message | transloco: item.params }}</span>
        <button
          type="button"
          class="btn-icon"
          [attr.aria-label]="'common.close' | transloco"
          (click)="notifications.dismiss(item.id)"
        >
          ×
        </button>
      </div>
    }
  `,
  host: { class: 'toasts', 'aria-live': 'polite' },
})
export class Toasts {
  readonly notifications = inject(NotificationsService);
}
