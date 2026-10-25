import { Component, computed, inject, input, output, resource } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { PersonDto } from '@genealogie/shared';
import { TranslocoPipe, translateSignal } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { GenealogyDatePipe } from '../../core/genealogy-pipes';
import { LanguageService } from '../../core/language.service';
import { NotificationsService } from '../../core/notifications.service';
import { valueOf } from '../../core/resources';
import { SessionStore } from '../../core/session.store';
import { eventIcon } from '../../ui/event-icons';
import { iconClose, iconDate, iconFamily, iconFocus, iconNote, iconPlace, iconRoot, sexIcon } from '../../ui/icons';
import { PersonName } from '../../ui/person-name';
import { NameOrderService } from '../../core/name-order.service';

/** Side panel with a person's full record. */
@Component({
  selector: 'app-person-details',
  imports: [PersonName, FaIconComponent, TranslocoPipe, GenealogyDatePipe],
  templateUrl: './person-details.html',
  styleUrl: './person-details.scss',
  host: { role: 'complementary', '[attr.aria-label]': 'label()' },
})
export class PersonDetails {
  readonly person = input.required<PersonDto>();
  private readonly hiddenLabel = translateSignal('person.hidden');
  private readonly names = inject(NameOrderService);
  protected readonly label = computed(() => {
    const person = this.person();
    return person.hidden ? this.hiddenLabel() : this.names.format(person);
  });
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
    return id ? valueOf(this.relatives)?.get(id) : undefined;
  }

  protected async setAsMyRoot(): Promise<void> {
    try {
      await this.session.setPersonalRoot(this.person().id);
      this.notifications.show('success', 'tree.myRootChanged');
    } catch (error) {
      this.notifications.error(error);
    }
  }

  protected async setAsRoot(): Promise<void> {
    try {
      await this.api.setRootPerson(this.person().id);
      this.notifications.show('success', 'tree.rootChanged');
    } catch (error) {
      this.notifications.error(error);
    }
  }

  protected readonly sexIcon = sexIcon;

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
