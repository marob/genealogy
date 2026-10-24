import { Component, inject, input, output, resource } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { PersonDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { GenealogyDatePipe } from '../../core/genealogy-pipes';
import { LanguageService } from '../../core/language.service';
import { NotificationsService } from '../../core/notifications.service';
import { SessionStore } from '../../core/session.store';
import { eventIcon } from '../../ui/event-icons';
import {
  iconClose,
  iconDate,
  iconFamily,
  iconFemale,
  iconFocus,
  iconMale,
  iconNote,
  iconPlace,
  iconRoot,
  iconUnknownSex,
} from '../../ui/icons';

/** Side panel with a person's full record. */
@Component({
  selector: 'app-person-details',
  imports: [FaIconComponent, TranslocoPipe, GenealogyDatePipe],
  templateUrl: './person-details.html',
  styleUrl: './person-details.scss',
  host: { role: 'complementary', '[attr.aria-label]': 'person().givenNames + " " + person().surname' },
})
export class PersonDetails {
  readonly person = input.required<PersonDto>();
  readonly closed = output();
  readonly focused = output<PersonDto>();

  private readonly api = inject(ApiService);
  private readonly notifications = inject(NotificationsService);
  protected readonly session = inject(SessionStore);
  protected readonly lang = inject(LanguageService).current;

  /** Relatives (parents, spouses, children) to display their names. */
  protected readonly relatives = resource({
    params: () => this.person(),
    loader: async ({ params: person }) => {
      const ids = [
        person.fatherId,
        person.motherId,
        ...person.unions.flatMap((union) => [union.partnerId, ...union.childIds]),
      ];
      return new Map((await this.api.people(ids)).map((relative) => [relative.id, relative]));
    },
  });

  protected relative(id: string | undefined): PersonDto | undefined {
    return id ? this.relatives.value()?.get(id) : undefined;
  }

  protected async setAsMyRoot(): Promise<void> {
    await this.session.setPersonalRoot(this.person().id);
    this.notifications.show('success', 'tree.myRootChanged');
  }

  protected async setAsRoot(): Promise<void> {
    await this.api.setRootPerson(this.person().id);
    this.notifications.show('success', 'tree.rootChanged');
  }

  protected sexIcon(sex: string) {
    return sex === 'M' ? iconMale : sex === 'F' ? iconFemale : iconUnknownSex;
  }

  protected readonly eventIcon = eventIcon;
  protected readonly icons = {
    iconClose,
    iconDate,
    iconFamily,
    iconFocus,
    iconNote,
    iconPlace,
    iconRoot,
  };
}
