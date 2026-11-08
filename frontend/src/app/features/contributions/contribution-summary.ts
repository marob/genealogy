import { Component, computed, input } from '@angular/core';
import type { ContributionDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { type ContributionField, presentFields } from './contribution-fields';

/** Value of a proposed person field: translated sex, mark for a cleared or missing value. */
@Component({
  selector: 'app-field-value',
  imports: [TranslocoPipe],
  template: `
    @if (!value()) {
      <em class="muted">{{ (value() === '' ? 'contributions.cleared' : 'contributions.none') | transloco }}</em>
    } @else if (field() === 'sex') {
      {{ 'sex.' + value() | transloco }}
    } @else {
      {{ value() }}
    }
  `,
})
export class FieldValue {
  readonly field = input.required<ContributionField>();
  readonly value = input<string>();
}

/** One-line description of a contribution: changed fields, new relative or document. */
@Component({
  selector: 'app-contribution-summary',
  imports: [TranslocoPipe, FieldValue],
  template: `
    @let c = contribution();
    @switch (c.kind) {
      @case ('edit-union') {
        <span class="muted">{{
          'contributions.labelled' | transloco: { label: ('contributions.kinds.edit-union' | transloco) }
        }}</span>
        @for (field of fields(); track field; let last = $last) {
          <span class="muted">{{
            'contributions.labelled' | transloco: { label: ('contributions.fields.' + field | transloco) }
          }}</span
          >&ngsp;<app-field-value [field]="field" [value]="c.fields[field]" />
          @if (!last) {
            ·
          }
        }
      }
      @case ('edit') {
        @for (field of fields(); track field; let last = $last) {
          <span class="muted">{{
            'contributions.labelled' | transloco: { label: ('contributions.fields.' + field | transloco) }
          }}</span
          >&ngsp;<app-field-value [field]="field" [value]="c.fields[field]" />
          @if (!last) {
            ·
          }
        }
      }
      @case ('add-person') {
        <span class="muted">{{
          'contributions.labelled' | transloco: { label: ('contributions.newRelative.' + c.relation | transloco) }
        }}</span>
        {{ c.fields.givenNames }} {{ c.fields.surname }}
      }
      @case ('add-media') {
        <span class="muted">{{
          'contributions.labelled' | transloco: { label: ('contributions.kinds.add-media' | transloco) }
        }}</span>
        {{ c.media?.title || c.media?.fileName }}
      }
    }
  `,
})
export class ContributionSummary {
  readonly contribution = input.required<ContributionDto>();
  protected readonly fields = computed(() => presentFields(this.contribution().fields));
}
