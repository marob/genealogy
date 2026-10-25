import { Component, inject, input } from '@angular/core';
import type { PersonSummaryDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { NameOrderService } from '../core/name-order.service';

/**
 * Name of a person, in the order chosen by the user (surname in capitals),
 * or a placeholder for a contemporary whose identity is hidden.
 */
@Component({
  selector: 'app-person-name',
  imports: [TranslocoPipe],
  template: `
    @let p = person();
    @if (p.hidden) {
      <em class="hidden-person">{{ 'person.hidden' | transloco }}</em>
    } @else if (order() === 'surname-first') {
      <span class="surname">{{ p.surname }}</span> {{ p.givenNames }}
    } @else {
      {{ p.givenNames }} <span class="surname">{{ p.surname }}</span>
    }
  `,
  styles: `
    .surname {
      text-transform: uppercase;
    }
    :host(.strong) .surname {
      font-weight: 600;
    }
  `,
})
export class PersonName {
  readonly person = input.required<Pick<PersonSummaryDto, 'givenNames' | 'surname' | 'hidden'>>();
  protected readonly order = inject(NameOrderService).current;
}
