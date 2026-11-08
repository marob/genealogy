import { DatePipe } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { ContributionDto, ContributionStatus } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { isoDate, saveBlob } from '../../core/download';
import { LanguageService } from '../../core/language.service';
import { NotificationsService } from '../../core/notifications.service';
import { valueOf } from '../../core/resources';
import { ConfirmService } from '../../ui/confirm-dialog';
import { iconCheck, iconExport, iconFile, iconReject } from '../../ui/icons';
import { FieldValue } from '../contributions/contribution-summary';
import { CONTRIBUTION_STATUSES, presentFields, statusBadge } from '../contributions/contribution-fields';
import { PersonName } from '../../ui/person-name';
import { NameOrderService } from '../../core/name-order.service';

/**
 * Review of the changes proposed by members. The approved ones are exported
 * as a GEDCOM file (with their documents) to be merged into the genealogy
 * software, which stays the source of truth: the site is only updated by a
 * later import.
 */
@Component({
  selector: 'app-contributions-admin',
  imports: [PersonName, FaIconComponent, TranslocoPipe, DatePipe, RouterLink, FieldValue],
  template: `
    <section class="card">
      <div class="title">
        <h2>{{ 'admin.contributions.title' | transloco }}</h2>
        <button
          type="button"
          class="btn btn-primary export"
          [disabled]="approvedCount() === 0 || busy()"
          (click)="export()"
        >
          <fa-icon [icon]="icons.iconExport" />
          {{ 'admin.contributions.export' | transloco: { count: approvedCount() } }}
        </button>
      </div>
      <p class="muted hint">{{ 'admin.contributions.exportHint' | transloco }}</p>
      <label class="field status-filter">
        <span>{{ 'admin.contributions.filter' | transloco }}</span>
        <select [value]="status()" (change)="status.set($any($event.target).value)">
          @for (value of statuses; track value) {
            <option [value]="value">{{ 'contributions.status.' + value | transloco }}</option>
          }
          <option value="">{{ 'admin.contributions.all' | transloco }}</option>
        </select>
      </label>
      <ul class="contributions">
        @for (c of list(); track c.id) {
          <li>
            <div class="contribution-header">
              <span [class]="badge(c.status)">{{ 'contributions.status.' + c.status | transloco }}</span>
              <strong>{{ 'contributions.kinds.' + c.kind | transloco }}</strong>
              <a [routerLink]="['/tree', c.personId]"><app-person-name [person]="c.person" /></a>
              <span class="muted">
                {{ c.author?.name ?? ('admin.contributions.deletedAuthor' | transloco) }} ·
                {{ c.createdAt | date: 'short' : undefined : lang() }}
              </span>
            </div>
            @switch (c.kind) {
              @case ('add-person') {
                <p class="relation">
                  {{ 'contributions.newRelative.' + c.relation | transloco }}
                  @if (c.partner; as partner) {
                    <span class="muted"
                      >({{ 'admin.contributions.withPartner' | transloco }}
                      <app-person-name [person]="partner" />)</span
                    >
                  }
                </p>
                <dl class="fields">
                  @for (field of fieldsOf(c); track field) {
                    <dt>{{ 'contributions.fields.' + field | transloco }}</dt>
                    <dd><app-field-value [field]="field" [value]="c.fields[field]" /></dd>
                  }
                </dl>
              }
              @case ('add-media') {
                <div class="media">
                  @if (c.media && !c.media.available) {
                    <span class="muted">{{
                      'admin.contributions.documentDeleted' | transloco: { name: c.media.fileName }
                    }}</span>
                  } @else if (c.media?.mimeType?.startsWith('image/')) {
                    <a [href]="mediaUrl(c)" target="_blank" rel="noopener">
                      <img [src]="mediaUrl(c)" [alt]="c.media?.title || c.media?.fileName" loading="lazy" />
                    </a>
                  } @else {
                    <a [href]="mediaUrl(c)" target="_blank" rel="noopener">
                      <fa-icon [icon]="icons.iconFile" /> {{ c.media?.fileName }}
                    </a>
                  }
                  @if (c.media?.title) {
                    <span>{{ c.media?.title }}</span>
                  }
                </div>
              }
              @default {
                <!-- Changed fields of a person or of a union. -->
                @if (c.kind === 'edit-union') {
                  <p class="relation">
                    {{ 'admin.contributions.unionWith' | transloco }}
                    @if (c.partner; as partner) {
                      <app-person-name [person]="partner" />
                    } @else {
                      <span class="muted">{{ 'contributions.unknownPartner' | transloco }}</span>
                    }
                  </p>
                }
                <div class="table-wrapper">
                  <table class="table">
                    <thead>
                      <tr>
                        <th scope="col">{{ 'admin.contributions.field' | transloco }}</th>
                        <th scope="col">{{ 'admin.contributions.current' | transloco }}</th>
                        <th scope="col">{{ 'admin.contributions.proposed' | transloco }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (field of fieldsOf(c); track field) {
                        <tr>
                          <th scope="row">{{ 'contributions.fields.' + field | transloco }}</th>
                          <td class="muted"><app-field-value [field]="field" [value]="c.previous?.[field]" /></td>
                          <td><app-field-value [field]="field" [value]="c.fields[field]" /></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
            @if (c.comment) {
              <blockquote class="comment">{{ c.comment }}</blockquote>
            }
            @if (c.status === 'pending') {
              <div class="actions">
                <button type="button" class="btn btn-small btn-primary" [disabled]="busy()" (click)="approve(c)">
                  <fa-icon [icon]="icons.iconCheck" /> {{ 'admin.contributions.approve' | transloco }}
                </button>
                <button type="button" class="btn btn-small btn-text" [disabled]="busy()" (click)="reject(c)">
                  <fa-icon [icon]="icons.iconReject" /> {{ 'admin.contributions.reject' | transloco }}
                </button>
              </div>
            }
          </li>
        } @empty {
          <li [class]="contributions.error() ? 'error' : 'muted'">
            {{ (contributions.error() ? 'common.error' : 'admin.contributions.none') | transloco }}
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    .title {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem 1rem;
      h2 {
        margin: 0;
      }
    }
    .hint {
      font-size: 0.875rem;
    }
    .status-filter {
      max-width: 14rem;
      margin-bottom: 0.75rem;
    }
    .contributions {
      margin: 0;
      padding: 0;
      list-style: none;
      > li {
        padding: 0.75rem 0;
        border-top: 1px solid var(--border);
      }
    }
    .contribution-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.75rem;
      margin-bottom: 0.5rem;
    }
    .relation {
      margin: 0 0 0.25rem;
    }
    .fields {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.2rem 1rem;
      margin: 0;
      dt {
        color: var(--text-muted);
      }
      dd {
        margin: 0;
      }
    }
    .media {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      img {
        display: block;
        max-width: 8rem;
        max-height: 8rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        object-fit: cover;
      }
    }
    .comment {
      margin: 0.5rem 0 0;
      padding-left: 0.75rem;
      border-left: 3px solid var(--border);
      white-space: pre-wrap;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
  `,
})
export class ContributionsAdmin {
  private readonly names = inject(NameOrderService);
  private readonly api = inject(ApiService);
  private readonly notifications = inject(NotificationsService);
  private readonly confirmService = inject(ConfirmService);
  protected readonly lang = inject(LanguageService).current;

  protected readonly statuses = CONTRIBUTION_STATUSES;
  /** Status shown; empty for all the contributions. */
  protected readonly status = signal<ContributionStatus | ''>('pending');
  protected readonly busy = signal(false);

  protected readonly contributions = resource({
    params: () => ({ status: this.status() }),
    loader: ({ params }) => this.api.contributions(params.status || undefined),
  });
  protected readonly list = computed(() => valueOf(this.contributions) ?? []);

  /** Approved contributions, waiting for the export. */
  private readonly approved = resource({ loader: () => this.api.contributions('approved') });
  protected readonly approvedCount = computed(() => valueOf(this.approved)?.length ?? 0);

  /** Edits: changed fields; new person: filled-in fields. */
  protected fieldsOf(contribution: ContributionDto) {
    return presentFields(contribution.fields);
  }

  protected mediaUrl(contribution: ContributionDto): string {
    return `/api/admin/contributions/${contribution.id}/media`;
  }

  protected badge(status: ContributionStatus): string {
    return statusBadge(status);
  }

  protected async approve(contribution: ContributionDto): Promise<void> {
    await this.run(async () => {
      await this.api.reviewContribution(contribution.id, { status: 'approved' });
      this.notifications.show('success', 'admin.contributions.approved');
    });
  }

  protected async reject(contribution: ContributionDto): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'admin.contributions.rejectTitle',
      message: 'admin.contributions.rejectMessage',
      params: { person: this.names.format(contribution.person) },
      confirmLabel: 'admin.contributions.reject',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await this.run(async () => {
      await this.api.reviewContribution(contribution.id, { status: 'rejected' });
      this.notifications.show('success', 'admin.contributions.rejected');
    });
  }

  /** Downloads the approved contributions (GEDCOM file + documents), which become "exported". */
  protected async export(): Promise<void> {
    const count = this.approvedCount();
    await this.run(async () => {
      const zip = await this.api.exportContributions();
      saveBlob(zip, `contributions-${isoDate()}.zip`);
      this.notifications.show('success', 'admin.contributions.exported', { count });
    });
  }

  /** Runs a review action, then refreshes the list and the export count. */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.notifications.error(error);
    } finally {
      this.busy.set(false);
      this.contributions.reload();
      this.approved.reload();
    }
  }

  protected readonly icons = { iconCheck, iconExport, iconFile, iconReject };
}
