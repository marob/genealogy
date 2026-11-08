import { Component, computed, inject, Injectable, input, output, type Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormBuilder, FormControl, type FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { ContributionDto, NewContributionDto, PersonDto, PersonFieldsDto, Sex } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, map, type Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { NotificationsService } from '../../core/notifications.service';
import { type ChoiceOption, ChoiceToggle } from '../../ui/choice-toggle';
import { iconChild, iconParents, iconUnion, sexIcon } from '../../ui/icons';
import {
  changedFields,
  currentFields,
  EMPTY_FIELDS,
  EMPTY_UNION_FIELDS,
  filledFields,
  isBlank,
  type PersonField,
  type PersonFieldValues,
  type UnionField,
  type UnionFieldValues,
} from './contribution-fields';

/** Person a contribution starts from, as shown in the details panel. */
export interface ContributionDialogData {
  person: PersonDto;
  /** Formatted name of the person. */
  personName: string;
  /**
   * Unions of the person, with the formatted name of the partner if known;
   * for a union without a second partner, the names of its children.
   */
  unions: { familyId: string; partnerName?: string; partnerless?: boolean; childNames?: string[] }[];
  /** Formatted names of the known parents. */
  parents: { father?: string; mother?: string };
  /** Union whose details are proposed (edit-union), with its current values. */
  union?: { familyId: string; partnerName?: string; values: UnionFieldValues };
}

type PersonFieldsGroup = FormGroup<Record<PersonField, FormControl<string>>>;
type UnionFieldsGroup = FormGroup<Record<UnionField, FormControl<string>>>;

const SEX_OPTIONS: readonly ChoiceOption<Sex>[] = [
  { value: 'M', icon: sexIcon('M'), label: 'sex.M' },
  { value: 'F', icon: sexIcon('F'), label: 'sex.F' },
  { value: 'U', icon: sexIcon('U'), label: 'sex.U' },
];

let nextId = 0;

/** Inputs of the person fields (names, sex, occupation, birth and death). */
@Component({
  selector: 'app-person-fields-form',
  imports: [ReactiveFormsModule, TranslocoPipe, ChoiceToggle],
  template: `
    <div class="person-fields" [formGroup]="group()">
      <label class="field">
        <span>{{ 'contributions.fields.givenNames' | transloco }}</span>
        <input formControlName="givenNames" autocomplete="off" />
      </label>
      <label class="field">
        <span>{{ 'contributions.fields.surname' | transloco }}</span>
        <input formControlName="surname" autocomplete="off" />
      </label>
      @if (!fixedSex()) {
        <div class="field sex">
          <span aria-hidden="true">{{ 'contributions.fields.sex' | transloco }}</span>
          <app-choice-toggle formControlName="sex" label="contributions.fields.sex" [options]="sexes" />
        </div>
      }
      <label class="field">
        <span>{{ 'contributions.fields.occupation' | transloco }}</span>
        <input formControlName="occupation" autocomplete="off" />
      </label>
      @for (event of events; track event) {
        <label class="field">
          <span>{{ 'contributions.fields.' + event + 'Date' | transloco }}</span>
          <input [formControlName]="event + 'Date'" autocomplete="off" [attr.aria-describedby]="hintId + event" />
          <small class="hint" [id]="hintId + event">{{ 'contributions.dateHint' | transloco }}</small>
        </label>
        <label class="field">
          <span>{{ 'contributions.fields.' + event + 'Place' | transloco }}</span>
          <input [formControlName]="event + 'Place'" autocomplete="off" />
        </label>
      }
    </div>
  `,
  styles: `
    .person-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: 0.75rem 1rem;
      align-items: start;
    }
    .sex {
      grid-column: 1 / -1;
    }
    .hint {
      color: var(--text-muted);
      font-size: 0.75rem;
    }
  `,
})
class PersonFieldsForm {
  readonly group = input.required<PersonFieldsGroup>();
  /** The sex is given by the role (father, mother): not asked. */
  readonly fixedSex = input(false);

  protected readonly sexes = SEX_OPTIONS;
  protected readonly events = ['birth', 'death'] as const;
  protected readonly hintId = `date-hint-${nextId++}-`;
}

/** Inputs of the union fields (marriage date and place). */
@Component({
  selector: 'app-union-fields-form',
  imports: [ReactiveFormsModule, TranslocoPipe],
  template: `
    <div class="union-fields" [formGroup]="group()">
      <label class="field">
        <span>{{ 'contributions.fields.marriageDate' | transloco }}</span>
        <input formControlName="marriageDate" autocomplete="off" [attr.aria-describedby]="hintId" />
        <small class="hint" [id]="hintId">{{ 'contributions.dateHint' | transloco }}</small>
      </label>
      <label class="field">
        <span>{{ 'contributions.fields.marriagePlace' | transloco }}</span>
        <input formControlName="marriagePlace" autocomplete="off" />
      </label>
    </div>
  `,
  styles: `
    .union-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: 0.75rem 1rem;
      align-items: start;
    }
    .hint {
      color: var(--text-muted);
      font-size: 0.75rem;
    }
  `,
})
class UnionFieldsForm {
  readonly group = input.required<UnionFieldsGroup>();
  protected readonly hintId = `marriage-hint-${nextId++}`;
}

/** Common part of the contribution dialogs: sending, success message, closing with the created contributions. */
abstract class ContributionDialog {
  protected readonly data = inject<ContributionDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ContributionDto[]>>(DialogRef);
  protected readonly api = inject(ApiService);
  private readonly notifications = inject(NotificationsService);
  protected readonly fb = inject(FormBuilder).nonNullable;
  protected readonly busy = signal(false);
  protected readonly comment = new FormControl('', { nonNullable: true });

  /** Comment to send, if any. */
  protected commentValue(): { comment?: string } {
    const comment = this.comment.value.trim();
    return comment ? { comment } : {};
  }

  /** Values of a form group, updated on each change. */
  protected valuesOf<T>(group: { valueChanges: Observable<unknown>; getRawValue(): T }): Signal<T> {
    return toSignal(group.valueChanges.pipe(map(() => group.getRawValue())), { initialValue: group.getRawValue() });
  }

  protected async send(request: () => Promise<ContributionDto | ContributionDto[]>): Promise<void> {
    this.busy.set(true);
    try {
      const created = await request();
      // The author sees their proposals in the data the server returns.
      this.api.clearCache();
      this.notifications.show('success', 'contributions.thanks');
      this.ref.close(Array.isArray(created) ? created : [created]);
    } catch (error) {
      // The dialog stays open so that the proposal can be fixed.
      this.notifications.error(error);
    } finally {
      this.busy.set(false);
    }
  }
}

const DIALOG_STYLES = `
  :host(.dialog) {
    width: min(42rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .intro {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  fieldset {
    margin: 0;
    padding: 0.75rem 1rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  legend {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.3rem;
    font-weight: 600;
  }
`;

/** Comment and buttons at the bottom of the contribution dialogs (inside their form). */
@Component({
  selector: 'app-contribution-footer',
  imports: [ReactiveFormsModule, TranslocoPipe],
  template: `
    <label class="field">
      <span>{{ 'contributions.comment' | transloco }}</span>
      <textarea rows="3" [formControl]="comment()" [placeholder]="'contributions.commentHint' | transloco"></textarea>
    </label>
    <div class="dialog-actions">
      <button type="button" class="btn btn-text" (click)="cancelled.emit()">
        {{ 'common.cancel' | transloco }}
      </button>
      <button type="submit" class="btn btn-primary" [disabled]="!canSend()">
        {{ 'contributions.submit' | transloco }}
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    textarea {
      width: 100%;
      padding: 0.45rem 0.6rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font: inherit;
      color: var(--text);
      background: var(--surface);
      resize: vertical;
    }
  `,
})
class ContributionFooter {
  readonly comment = input.required<FormControl<string>>();
  readonly canSend = input.required<boolean>();
  readonly cancelled = output();
}

/** Correction of a person's record: only the changed fields are sent. */
@Component({
  selector: 'app-edit-person-dialog',
  imports: [ReactiveFormsModule, TranslocoPipe, PersonFieldsForm, ContributionFooter],
  template: `
    <h2 class="dialog-title" id="contribution-dialog-title">
      {{ 'contributions.editTitle' | transloco: { name: data.personName } }}
    </h2>
    <form (submit)="$event.preventDefault(); submit()">
      <p class="intro">{{ 'contributions.editIntro' | transloco }}</p>
      <app-person-fields-form [group]="form" />
      <app-contribution-footer [comment]="comment" [canSend]="valid() && !busy()" (cancelled)="ref.close()" />
    </form>
  `,
  styles: DIALOG_STYLES,
  host: { class: 'dialog' },
})
export class EditPersonDialog extends ContributionDialog {
  private readonly initial = currentFields(this.data.person);
  protected readonly form: PersonFieldsGroup = this.fb.group({ ...this.initial });
  private readonly values = this.valuesOf<PersonFieldValues>(this.form);
  protected readonly changes = computed(() => changedFields(this.initial, this.values()) as PersonFieldsDto);
  protected readonly valid = computed(() => Object.keys(this.changes()).length > 0);

  protected async submit(): Promise<void> {
    if (!this.valid()) {
      return;
    }
    await this.send(() =>
      this.api.propose({
        kind: 'edit',
        personId: this.data.person.id,
        fields: this.changes(),
        ...this.commentValue(),
      }),
    );
  }
}

/** Relatives that can be added: a child, the parents (one or both, with their union), a spouse. */
export type RelativeChoice = 'child' | 'parents' | 'spouse';

/** New relatives of a person: a child, the parents, or a spouse. */
@Component({
  selector: 'app-add-relative-dialog',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    FaIconComponent,
    ChoiceToggle,
    PersonFieldsForm,
    UnionFieldsForm,
    ContributionFooter,
  ],
  template: `
    <h2 class="dialog-title" id="contribution-dialog-title">
      {{ 'contributions.addRelativeTitle' | transloco: { name: data.personName } }}
    </h2>
    <form (submit)="$event.preventDefault(); submit()">
      <app-choice-toggle [formControl]="relation" label="contributions.relation" [options]="relations" />
      @switch (relationValue()) {
        @case ('child') {
          <label class="field">
            <span>{{ 'contributions.otherParent' | transloco }}</span>
            <select [formControl]="familyId">
              @for (union of data.unions; track union.familyId) {
                <option [value]="union.familyId">
                  {{ union.partnerName ?? ('contributions.unknownPartner' | transloco) }}
                </option>
              }
              <option value="">{{ 'contributions.noOtherParent' | transloco }}</option>
            </select>
          </label>
          <app-person-fields-form [group]="form" />
        }
        @case ('spouse') {
          @if (partnerless.length) {
            <label class="field">
              <span>{{ 'contributions.sharedChildren' | transloco }}</span>
              <select [formControl]="spouseFamilyId">
                @for (union of partnerless; track union.familyId) {
                  <option [value]="union.familyId">
                    {{
                      union.childNames?.length ? union.childNames?.join(', ') : ('contributions.noChildren' | transloco)
                    }}
                  </option>
                }
                <option value="">{{ 'contributions.newUnion' | transloco }}</option>
              </select>
            </label>
          }
          <app-person-fields-form [group]="form" />
          <fieldset>
            <legend><fa-icon [icon]="icons.union" /> {{ 'contributions.unionDetails' | transloco }}</legend>
            <app-union-fields-form [group]="unionForm" />
          </fieldset>
        }
        @case ('parents') {
          <p class="intro">{{ 'contributions.parentsIntro' | transloco }}</p>
          @for (parent of parentForms; track parent.role) {
            <fieldset>
              <legend>
                <fa-icon [class]="'sex sex-' + parent.sex" [icon]="parent.icon" />
                {{ 'contributions.' + parent.role | transloco }}
              </legend>
              @if (parent.known; as name) {
                <p class="intro">{{ 'contributions.knownParent' | transloco: { name } }}</p>
              } @else {
                <app-person-fields-form [group]="parent.form" [fixedSex]="true" />
              }
            </fieldset>
          }
          <fieldset>
            <legend><fa-icon [icon]="icons.union" /> {{ 'contributions.parentsUnion' | transloco }}</legend>
            <app-union-fields-form [group]="unionForm" />
          </fieldset>
        }
      }
      <app-contribution-footer [comment]="comment" [canSend]="valid() && !busy()" (cancelled)="ref.close()" />
    </form>
  `,
  styles: DIALOG_STYLES,
  host: { class: 'dialog' },
})
export class AddRelativeDialog extends ContributionDialog {
  protected readonly icons = { union: iconUnion };
  private readonly bothParentsKnown = !!this.data.parents.father && !!this.data.parents.mother;
  protected readonly relations: readonly ChoiceOption<RelativeChoice>[] = [
    { value: 'child', icon: iconChild, label: 'contributions.relations.child' },
    { value: 'parents', icon: iconParents, label: 'contributions.relations.parents', disabled: this.bothParentsKnown },
    { value: 'spouse', icon: iconUnion, label: 'contributions.relations.spouse' },
  ];
  protected readonly relation = new FormControl<RelativeChoice>('child', { nonNullable: true });
  protected readonly relationValue = toSignal(this.relation.valueChanges, { initialValue: this.relation.value });
  /** Unions without a second partner, that a new spouse can join (becoming the other parent of the children). */
  protected readonly partnerless = this.data.unions.filter((union) => union.partnerless);
  protected readonly spouseFamilyId = new FormControl(this.partnerless[0]?.familyId ?? '', { nonNullable: true });
  /** Other parent of a child: a union of the person, or none (unknown). */
  protected readonly familyId = new FormControl(this.data.unions[0]?.familyId ?? '', { nonNullable: true });
  protected readonly form: PersonFieldsGroup = this.fb.group({ ...EMPTY_FIELDS, surname: this.surnameFor('child') });
  protected readonly unionForm: UnionFieldsGroup = this.fb.group({ ...EMPTY_UNION_FIELDS });
  protected readonly parentForms = [
    {
      role: 'father',
      sex: 'M',
      icon: sexIcon('M'),
      known: this.data.parents.father,
      // A father usually gives his surname.
      form: this.fb.group({ ...EMPTY_FIELDS, sex: 'M', surname: this.data.person.surname }) as PersonFieldsGroup,
    },
    {
      role: 'mother',
      sex: 'F',
      icon: sexIcon('F'),
      known: this.data.parents.mother,
      form: this.fb.group({ ...EMPTY_FIELDS, sex: 'F' }) as PersonFieldsGroup,
    },
  ] as const;
  private readonly values = this.valuesOf<PersonFieldValues>(this.form);

  constructor() {
    super();
    // The suggested surname follows the relation, until the user types one.
    this.relation.valueChanges.subscribe((relation) => {
      const surname = this.form.controls.surname;
      if (!surname.dirty) {
        surname.setValue(this.surnameFor(relation));
      }
    });
  }

  /** A child of a man usually bears his surname. */
  private surnameFor(relation: RelativeChoice): string {
    return relation === 'child' && this.data.person.sex === 'M' ? this.data.person.surname : '';
  }

  private readonly unionValues = this.valuesOf<UnionFieldValues>(this.unionForm);
  private readonly fatherValues = this.valuesOf<PersonFieldValues>(this.parentForms[0].form);
  private readonly motherValues = this.valuesOf<PersonFieldValues>(this.parentForms[1].form);

  /** New parents (filled in, not known yet); undefined if one is partly filled in. */
  private readonly newParents = computed(() => {
    const parents: { father?: PersonFieldsDto; mother?: PersonFieldsDto } = {};
    const entries = [
      ['father', this.fatherValues(), this.data.parents.father],
      ['mother', this.motherValues(), this.data.parents.mother],
    ] as const;
    for (const [role, values, known] of entries) {
      if (known || isBlank(values)) {
        continue;
      }
      if (!hasNames(values)) {
        return undefined;
      }
      parents[role] = filledFields(values) as PersonFieldsDto;
    }
    return parents;
  });

  protected readonly valid = computed(() => {
    if (this.relationValue() === 'parents') {
      const parents = this.newParents();
      return !!parents && (!!parents.father || !!parents.mother);
    }
    return hasNames(this.values());
  });

  protected async submit(): Promise<void> {
    if (!this.valid()) {
      return;
    }
    const personId = this.data.person.id;
    const union = filledFields(this.unionValues());
    const withUnion = Object.keys(union).length ? { union } : {};
    const relation = this.relation.value;
    const request: NewContributionDto =
      relation === 'parents'
        ? { kind: 'add-parents', personId, ...this.newParents(), ...withUnion, ...this.commentValue() }
        : {
            kind: 'add-person',
            personId,
            relation,
            ...(relation === 'child' && this.familyId.value ? { familyId: this.familyId.value } : {}),
            ...(relation === 'spouse' && this.spouseFamilyId.value ? { familyId: this.spouseFamilyId.value } : {}),
            fields: filledFields(this.values()) as PersonFieldsDto,
            ...(relation === 'spouse' ? withUnion : {}),
            ...this.commentValue(),
          };
    await this.send(() => this.api.propose(request));
  }
}

/** A new person needs a given name or a surname (the other one may be unknown). */
function hasNames(values: PersonFieldValues): boolean {
  return !!values.givenNames.trim() || !!values.surname.trim();
}

/** Details of a union (marriage date and place): only the changed fields are sent. */
@Component({
  selector: 'app-edit-union-dialog',
  imports: [ReactiveFormsModule, TranslocoPipe, UnionFieldsForm, ContributionFooter],
  template: `
    <h2 class="dialog-title" id="contribution-dialog-title">
      @if (union.partnerName) {
        {{ 'contributions.editUnionTitle' | transloco: { name: data.personName, partner: union.partnerName } }}
      } @else {
        {{ 'contributions.editUnionTitleAlone' | transloco: { name: data.personName } }}
      }
    </h2>
    <form (submit)="$event.preventDefault(); submit()">
      <p class="intro">{{ 'contributions.editIntro' | transloco }}</p>
      <app-union-fields-form [group]="form" />
      <app-contribution-footer [comment]="comment" [canSend]="valid() && !busy()" (cancelled)="ref.close()" />
    </form>
  `,
  styles: DIALOG_STYLES,
  host: { class: 'dialog' },
})
export class EditUnionDialog extends ContributionDialog {
  protected readonly union = this.data.union!;
  protected readonly form: UnionFieldsGroup = this.fb.group({ ...this.union.values });
  private readonly values = this.valuesOf<UnionFieldValues>(this.form);
  private readonly changes = computed(() => changedFields(this.union.values, this.values()));
  protected readonly valid = computed(() => Object.keys(this.changes()).length > 0);

  protected async submit(): Promise<void> {
    if (!this.valid()) {
      return;
    }
    await this.send(() =>
      this.api.propose({
        kind: 'edit-union',
        personId: this.data.person.id,
        familyId: this.union.familyId,
        fields: this.changes(),
        ...this.commentValue(),
      }),
    );
  }
}

/** New document (photo, scanned record) for a person. */
@Component({
  selector: 'app-add-media-dialog',
  imports: [ReactiveFormsModule, TranslocoPipe, ContributionFooter],
  template: `
    <h2 class="dialog-title" id="contribution-dialog-title">
      {{ 'contributions.addMediaTitle' | transloco: { name: data.personName } }}
    </h2>
    <form (submit)="$event.preventDefault(); submit()">
      <label class="field">
        <span>{{ 'contributions.file' | transloco }}</span>
        <input #input type="file" accept="image/*,application/pdf" required (change)="select(input)" />
      </label>
      <label class="field">
        <span>{{ 'contributions.documentTitle' | transloco }}</span>
        <input [formControl]="title" autocomplete="off" />
      </label>
      <app-contribution-footer [comment]="comment" [canSend]="valid() && !busy()" (cancelled)="ref.close()" />
    </form>
  `,
  styles: DIALOG_STYLES,
  host: { class: 'dialog' },
})
export class AddMediaDialog extends ContributionDialog {
  protected readonly file = signal<File | undefined>(undefined);
  protected readonly title = new FormControl('', { nonNullable: true });
  protected readonly valid = computed(() => !!this.file());

  protected select(input: HTMLInputElement): void {
    this.file.set(input.files?.[0]);
  }

  protected async submit(): Promise<void> {
    const file = this.file();
    if (!file) {
      return;
    }
    const title = this.title.value.trim();
    await this.send(() =>
      this.api.proposeMedia(this.data.person.id, file, { ...(title ? { title } : {}), ...this.commentValue() }),
    );
  }
}

const DIALOGS = {
  edit: EditPersonDialog,
  'add-person': AddRelativeDialog,
  'add-media': AddMediaDialog,
  'edit-union': EditUnionDialog,
};

/** Opens the dialogs to propose a change; resolves to the contributions created (none if cancelled). */
@Injectable({ providedIn: 'root' })
export class ContributionDialogs {
  private readonly dialog = inject(Dialog);

  async open(kind: keyof typeof DIALOGS, data: ContributionDialogData): Promise<ContributionDto[]> {
    const ref = this.dialog.open<ContributionDto[]>(DIALOGS[kind], {
      data,
      ariaModal: true,
      ariaLabelledBy: 'contribution-dialog-title',
    });
    return (await firstValueFrom(ref.closed)) ?? [];
  }
}
