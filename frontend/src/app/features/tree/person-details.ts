import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output, resource } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { mediaThumbnailUrl, type MediaDto, type PersonDto, type UnionDto } from '@genealogie/shared';
import { TranslocoPipe, translateSignal } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { GenealogyDatePipe } from '../../core/genealogy-pipes';
import { LanguageService } from '../../core/language.service';
import { NotificationsService } from '../../core/notifications.service';
import { valueOf } from '../../core/resources';
import { SessionStore } from '../../core/session.store';
import { eventIcon } from '../../ui/event-icons';
import {
  iconAddPerson,
  iconClose,
  iconDate,
  iconDocuments,
  iconEdit,
  iconFamily,
  iconFocus,
  iconNote,
  iconPlace,
  iconRoot,
  iconUndo,
  iconUnion,
  iconUpload,
  sexIcon,
} from '../../ui/icons';
import { PersonName } from '../../ui/person-name';
import { NameOrderService } from '../../core/name-order.service';
import { MediaViewerService } from '../../ui/media-viewer';
import { ConfirmService } from '../../ui/confirm-dialog';
import { type ContributionDialogData, ContributionDialogs } from '../contributions/contribution-dialogs';
import { hasVisibleMedia, isImage, MediaList, portraitOf } from './media-list';
import { TreeController } from './tree-controller';

/**
 * Proposed fields of the birth and death: as on the server, they apply to the
 * first event of these types.
 */
const EVENT_FIELDS: { types: string[]; fields: string[] }[] = [
  { types: ['BIRT', 'CHR', 'BAPM'], fields: ['birthDate', 'birthPlace'] },
  { types: ['DEAT', 'BURI', 'CREM'], fields: ['deathDate', 'deathPlace'] },
];
const NAME_FIELDS = ['givenNames', 'surname', 'sex'];

/** Relative to show instead of a withdrawn proposed person (from the genealogy if possible). */
function withdrawnRelative(person: PersonDto): string | undefined {
  const ids = [
    ...person.unions.map((union) => union.partnerId),
    person.fatherId,
    person.motherId,
    ...person.unions.flatMap((union) => union.childIds),
  ].filter((id): id is string => !!id);
  return ids.find((id) => !id.startsWith('W')) ?? ids[0];
}

/** Side panel with a person's full record. */
@Component({
  selector: 'app-person-details',
  imports: [PersonName, FaIconComponent, TranslocoPipe, GenealogyDatePipe, MediaList, NgTemplateOutlet],
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
  private readonly viewer = inject(MediaViewerService);
  private readonly contributionDialogs = inject(ContributionDialogs);
  private readonly confirmService = inject(ConfirmService);
  /** Tree displaying the person, refreshed after a proposal. */
  private readonly tree = inject(TreeController, { optional: true });

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

  /** Portrait shown in the header. */
  protected readonly portrait = computed(() => portraitOf(this.person().media));

  protected openPortrait(portrait: MediaDto): void {
    const images = this.person().media.filter(isImage);
    this.viewer.open(images, images.indexOf(portrait));
  }

  protected hasMedia(media: readonly MediaDto[]): boolean {
    return hasVisibleMedia(media, this.session.isAdmin());
  }

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

  /**
   * The current user's proposals applied to this person, not yet integrated
   * into the genealogy: notice of the record and proposed fields.
   */
  protected readonly proposal = computed(() => {
    const proposal = this.person().proposal;
    if (!proposal) {
      return undefined;
    }
    const accepted = proposal.status !== 'pending';
    return {
      notice: `contributions.overlay.${proposal.isNew ? 'new' : 'edit'}${accepted ? 'Accepted' : 'Pending'}`,
      marker: accepted ? 'contributions.overlay.acceptedMarker' : 'contributions.overlay.pendingMarker',
      fields: new Set(proposal.isNew ? [] : (proposal.fields ?? [])),
    };
  });

  /** Some of the given fields come from the current user's proposals. */
  protected isProposed(fields: readonly string[] | undefined): boolean {
    const proposed = this.proposal()?.fields;
    return !!proposed && !!fields?.some((field) => proposed.has(field));
  }

  protected readonly nameFields = NAME_FIELDS;

  /** Events whose date or place were proposed. */
  protected readonly proposedEvents = computed(() => {
    const events = this.person().events;
    return new Set(
      EVENT_FIELDS.filter(({ fields }) => this.isProposed(fields)).flatMap(({ types }) => {
        const event = events.find((e) => types.includes(e.type));
        return event ? [event] : [];
      }),
    );
  });

  /**
   * A proposed occupation replaces the occupation events, which only hold
   * the genealogy data.
   */
  protected readonly proposedOccupation = computed(() =>
    this.isProposed(['occupation']) ? (this.person().occupation ?? '') : undefined,
  );

  protected readonly events = computed(() => {
    const events = this.person().events;
    return this.proposedOccupation() === undefined ? events : events.filter((event) => event.type !== 'OCCU');
  });

  /**
   * Signed-in members can propose changes to the people whose details they
   * can see, including the people they proposed. Proposals are reviewed by an
   * administrator; their author sees them in the tree until they are
   * integrated.
   */
  protected readonly canPropose = computed(
    () => this.session.isAuthenticated() && !this.person().restricted && !this.person().hidden,
  );

  protected async propose(kind: 'edit' | 'add-person' | 'add-media'): Promise<void> {
    await this.openDialog(kind);
  }

  /** Proposes the details of a union (marriage date and place). */
  protected async proposeUnion(union: UnionDto): Promise<void> {
    const marriage = union.events.find((event) => event.type === 'MARR');
    await this.openDialog('edit-union', {
      familyId: union.familyId,
      ...this.partnerName(union.partnerId),
      values: { marriageDate: marriage?.date?.original ?? '', marriagePlace: marriage?.place?.name ?? '' },
    });
  }

  private partnerName(id: string | undefined): { partnerName?: string } {
    const partner = this.relative(id);
    return partner && !partner.hidden ? { partnerName: this.names.format(partner) } : {};
  }

  private async openDialog(
    kind: 'edit' | 'add-person' | 'add-media' | 'edit-union',
    union?: ContributionDialogData['union'],
  ): Promise<void> {
    const person = this.person();
    const parentName = (id: string | undefined) => this.partnerName(id).partnerName;
    const created = await this.contributionDialogs.open(kind, {
      person,
      personName: this.names.format(person),
      unions: person.unions.map((u) => ({
        familyId: u.familyId,
        ...this.partnerName(u.partnerId),
        ...(u.partnerId
          ? {}
          : {
              partnerless: true,
              childNames: u.childIds.flatMap((id) => {
                const child = this.relative(id);
                return child && !child.hidden ? [this.names.format(child)] : [];
              }),
            }),
      })),
      parents: { father: parentName(person.fatherId), mother: parentName(person.motherId) },
      ...(union ? { union } : {}),
    });
    if (created.length === 0) {
      return;
    }
    // The proposal now shows in this record, and the new relatives in the tree.
    const relation = created.find((c) => c.kind === 'add-person')?.relation;
    await this.tree?.reload(
      relation === 'parent' || relation === 'child'
        ? { personId: person.id, direction: relation === 'parent' ? 'parents' : 'children' }
        : undefined,
    );
  }

  /**
   * Pending proposals of the current user behind this record: a proposed
   * person (withdrawn with the proposals about them), or proposed values.
   */
  protected readonly withdrawable = computed(() => {
    const person = this.person();
    const pending = person.proposal?.pending ?? [];
    const own = pending.find((id) => person.id === `W${id}`);
    return own !== undefined
      ? { ids: [own], isNew: true }
      : pending.length
        ? { ids: pending, isNew: false }
        : undefined;
  });

  protected async withdraw(ids: readonly number[], message: string, isNew = false): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'contributions.overlay.withdrawTitle',
      message,
      confirmLabel: 'contributions.mine.withdraw',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    const person = this.person();
    try {
      for (const id of ids) {
        await this.api.withdrawContribution(id);
      }
      this.notifications.show('success', 'contributions.mine.withdrawn');
    } catch (error) {
      this.notifications.error(error);
    }
    this.api.clearCache();
    if (isNew && this.tree?.root()?.person.id === person.id) {
      // The tree was centred on the withdrawn person: centre it on a relative.
      const relative = withdrawnRelative(person);
      this.tree.select(undefined);
      if (relative) {
        this.tree.focus({ id: relative });
        return;
      }
    }
    await this.tree?.reload();
  }

  protected readonly sexIcon = sexIcon;
  protected readonly thumbnailUrl = mediaThumbnailUrl;

  protected readonly eventIcon = eventIcon;
  protected readonly icons = {
    iconAddPerson,
    iconClose,
    iconDate,
    iconDocuments,
    iconEdit,
    iconFamily,
    iconFocus,
    iconNote,
    iconPlace,
    iconRoot,
    iconUndo,
    iconUnion,
    iconUpload,
  };
}
