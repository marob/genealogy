import { DatePipe, DecimalPipe, KeyValuePipe } from '@angular/common';
import { Component, inject, resource, signal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { ImportDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { LanguageService } from '../../core/language.service';
import { NotificationsService } from '../../core/notifications.service';
import { ConfirmService } from '../../ui/confirm-dialog';
import { iconCheck, iconDelete, iconImport } from '../../ui/icons';

/**
 * Two-step GEDCOM import: analysis (preview, statistics, warnings), then
 * application. The history allows re-applying a previous import.
 */
@Component({
  selector: 'app-imports-admin',
  imports: [FaIconComponent, TranslocoPipe, DatePipe, DecimalPipe, KeyValuePipe],
  templateUrl: './imports-admin.html',
})
export class ImportsAdmin {
  private readonly api = inject(ApiService);
  private readonly notifications = inject(NotificationsService);
  private readonly confirmService = inject(ConfirmService);
  protected readonly lang = inject(LanguageService).current;

  protected readonly history = resource({ loader: () => this.api.imports() });
  protected readonly preview = signal<ImportDto | undefined>(undefined);
  protected readonly busy = signal(false);

  protected async upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    await this.run(async () => {
      this.preview.set(await this.api.uploadGedcom(file));
      this.history.reload();
    });
  }

  protected async commit(run: ImportDto): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'admin.imports.confirmTitle',
      message: 'admin.imports.confirmMessage',
      params: { file: run.fileName, persons: run.stats.persons },
      confirmLabel: 'admin.imports.apply',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await this.run(async () => {
      await this.api.commitImport(run.id);
      this.preview.set(undefined);
      this.history.reload();
      this.notifications.show('success', 'admin.imports.applied', { persons: run.stats.persons });
    });
  }

  protected async remove(run: ImportDto): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'admin.imports.deleteTitle',
      message: 'admin.imports.deleteMessage',
      params: { file: run.fileName },
      confirmLabel: 'common.delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await this.run(async () => {
      await this.api.deleteImport(run.id);
      if (this.preview()?.id === run.id) {
        this.preview.set(undefined);
      }
      this.history.reload();
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.notifications.error(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected readonly icons = { iconCheck, iconDelete, iconImport };
}
