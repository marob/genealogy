import { DatePipe, DecimalPipe, KeyValuePipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, resource, signal, type WritableSignal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { ImportDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { LanguageService } from '../../core/language.service';
import { NotificationsService } from '../../core/notifications.service';
import { valueOf } from '../../core/resources';
import { ConfirmService } from '../../ui/confirm-dialog';
import { iconArchive, iconCheck, iconClose, iconDelete, iconImport } from '../../ui/icons';

/**
 * Two-step GEDCOM import: analysis (preview, statistics, warnings), then
 * application. The history allows re-applying a previous import. The
 * documents (photos, scanned records) are sent along with the GEDCOM file,
 * either in a separate .zip or in a single .zip containing both.
 */
@Component({
  selector: 'app-imports-admin',
  imports: [FaIconComponent, TranslocoPipe, DatePipe, DecimalPipe, KeyValuePipe, PercentPipe],
  templateUrl: './imports-admin.html',
})
export class ImportsAdmin {
  private readonly api = inject(ApiService);
  private readonly notifications = inject(NotificationsService);
  private readonly confirmService = inject(ConfirmService);
  protected readonly lang = inject(LanguageService).current;

  protected readonly history = resource({ loader: () => this.api.imports() });
  protected readonly runs = computed(() => valueOf(this.history) ?? []);
  protected readonly preview = signal<ImportDto | undefined>(undefined);
  protected readonly busy = signal(false);

  /** Selected GEDCOM file (or .zip with the GEDCOM file and its documents). */
  protected readonly gedcom = signal<File | undefined>(undefined);
  /** Selected .zip of the documents (optional). */
  protected readonly media = signal<File | undefined>(undefined);
  /** Fraction of the upload already sent, while uploading. */
  protected readonly progress = signal<number | undefined>(undefined);

  protected select(input: HTMLInputElement, target: WritableSignal<File | undefined>): void {
    target.set(input.files?.[0]);
  }

  protected clearMedia(input: HTMLInputElement): void {
    input.value = '';
    this.media.set(undefined);
  }

  protected async upload(...inputs: HTMLInputElement[]): Promise<void> {
    const file = this.gedcom();
    if (!file) {
      return;
    }
    this.progress.set(0);
    await this.run(async () => {
      this.preview.set(await this.api.uploadGedcom(file, this.media(), (sent) => this.progress.set(sent)));
      this.history.reload();
      for (const input of inputs) {
        input.value = '';
      }
      this.gedcom.set(undefined);
      this.media.set(undefined);
    });
    this.progress.set(undefined);
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

  protected readonly icons = { iconArchive, iconCheck, iconClose, iconDelete, iconImport };
}
