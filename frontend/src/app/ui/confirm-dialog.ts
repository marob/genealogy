import { Component, inject, Injectable } from '@angular/core';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

export interface ConfirmOptions {
  /** Translation keys. */
  title: string;
  message: string;
  params?: Record<string, unknown>;
  confirmLabel?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [TranslocoPipe],
  template: `
    <h2 class="dialog-title">{{ data.title | transloco: data.params }}</h2>
    <p>{{ data.message | transloco: data.params }}</p>
    <div class="dialog-actions">
      <button type="button" class="btn btn-text" (click)="ref.close(false)">{{ 'common.cancel' | transloco }}</button>
      <button
        type="button"
        class="btn"
        [class.btn-danger]="data.danger"
        [class.btn-primary]="!data.danger"
        cdkFocusInitial
        (click)="ref.close(true)"
      >
        {{ data.confirmLabel ?? 'common.confirm' | transloco }}
      </button>
    </div>
  `,
  host: { class: 'dialog' },
})
class ConfirmDialog {
  readonly data = inject<ConfirmOptions>(DIALOG_DATA);
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(Dialog);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open<boolean>(ConfirmDialog, { data: options, role: 'alertdialog', ariaModal: true });
    return (await firstValueFrom(ref.closed)) === true;
  }
}
