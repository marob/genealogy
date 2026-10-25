import { Component, computed, inject, input } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { EventDto, PersonDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { GenealogyDatePipe, PlacePipe } from '../../core/genealogy-pipes';
import { LanguageService } from '../../core/language.service';
import { eventIcon } from '../../ui/event-icons';
import { iconDate, iconFocus, iconOccupation, iconPlace, sexIcon } from '../../ui/icons';
import { Tooltip } from '../../ui/tooltip';
import { TreeController } from './tree-controller';
import type { TreePart } from './tree-node';
import { PersonName } from '../../ui/person-name';

/** Card of a person in the tree. */
@Component({
  selector: 'app-person-card',
  imports: [PersonName, FaIconComponent, TranslocoPipe, GenealogyDatePipe, PlacePipe, Tooltip],
  templateUrl: './person-card.html',
  styleUrl: './person-card.scss',
  host: {
    '[class]': '"person-card part-" + part() + " sex-" + person().sex',
    '[class.restricted]': 'person().restricted',
  },
})
export class PersonCard {
  readonly person = input.required<PersonDto>();
  readonly part = input.required<TreePart>();

  protected readonly tree = inject(TreeController);
  protected readonly lang = inject(LanguageService).current;

  protected readonly milestones = computed(() => {
    const events = this.person().events;
    const find = (...types: string[]): EventDto | undefined => events.find((event) => types.includes(event.type));
    return [
      { key: 'BIRT', event: find('BIRT') },
      { key: 'CHR', event: find('CHR', 'BAPM') },
      { key: 'DEAT', event: find('DEAT') ?? find('BURI') ?? find('CREM') },
    ].flatMap(({ key, event }) => (event ? [{ key, event, icon: eventIcon(event.type) }] : []));
  });

  protected readonly sexIcon = computed(() => sexIcon(this.person().sex));

  protected readonly icons = { iconFocus, iconOccupation, iconDate, iconPlace };
}
