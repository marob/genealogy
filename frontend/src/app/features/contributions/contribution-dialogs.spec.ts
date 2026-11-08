import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { EventDto, PersonDto } from '@genealogie/shared';
import { person, provideTestTransloco } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { NotificationsService } from '../../core/notifications.service';
import {
  AddMediaDialog,
  AddRelativeDialog,
  type ContributionDialogData,
  EditPersonDialog,
  EditUnionDialog,
} from './contribution-dialogs';

function event(type: string, original: string, place?: string): EventDto {
  return {
    type,
    date: { original, qualifier: 'exact', calendar: 'gregorian', start: { year: 1850 } },
    ...(place ? { place: { id: 1, name: place } } : {}),
  };
}

const jean = person({
  id: 'I1',
  occupation: 'Laboureur',
  events: [event('CHR', '14 MAR 1850', 'Lyon'), event('BURI', 'ABT 1910', 'Paris')],
});

describe('Contribution dialogs', () => {
  const api = { propose: vi.fn(), proposeMedia: vi.fn(), clearCache: vi.fn() };
  const close = vi.fn();
  const notifications = { show: vi.fn(), error: vi.fn() };

  function render<T>(
    component: Type<T>,
    subject: PersonDto = jean,
    unions: ContributionDialogData['unions'] = [],
    more: Partial<ContributionDialogData> = {},
  ) {
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        { provide: ApiService, useValue: api },
        { provide: NotificationsService, useValue: notifications },
        { provide: DialogRef, useValue: { close } },
        {
          provide: DIALOG_DATA,
          useValue: {
            person: subject,
            personName: 'MARTIN Jean',
            unions,
            parents: {},
            ...more,
          } satisfies ContributionDialogData,
        },
      ],
    });
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api.propose.mockReset().mockResolvedValue([{ id: 1 }]);
    api.proposeMedia.mockReset().mockResolvedValue({ id: 2 });
    api.clearCache.mockReset();
    close.mockReset();
    notifications.show.mockReset();
    notifications.error.mockReset();
  });

  function input(element: HTMLElement, label: string): HTMLInputElement | HTMLSelectElement {
    const field = [...element.querySelectorAll('label.field')].find(
      (candidate) => candidate.querySelector('span')!.textContent.trim() === label,
    );
    return field!.querySelector('input, select, textarea')!;
  }

  function type(element: HTMLElement, label: string, value: string) {
    const control = input(element, label);
    control.value = value;
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
  }

  /** Options of a choice toggle: label, checked, disabled. */
  function choices(element: HTMLElement, group: string) {
    const radios = element.querySelector(`[role="radiogroup"][aria-label="${group}"]`)!;
    return [...radios.querySelectorAll('label')].map((label) => ({
      label: label.textContent.trim(),
      input: label.querySelector('input')!,
    }));
  }

  function choose(element: HTMLElement, group: string, option: string) {
    choices(element, group)
      .find((choice) => choice.label === option)!
      .input.click();
  }

  function submitButton(element: HTMLElement) {
    return element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }

  describe('EditPersonDialog', () => {
    it('is prefilled with the current values, baptism and burial standing in for birth and death', () => {
      const element = render(EditPersonDialog).nativeElement as HTMLElement;
      expect(input(element, 'Prénoms').value).toBe('Jean');
      expect(input(element, 'Nom').value).toBe('MARTIN');
      expect(choices(element, 'Sexe').map((c) => [c.label, c.input.checked])).toEqual([
        ['Homme', true],
        ['Femme', false],
        ['Inconnu', false],
      ]);
      expect(input(element, 'Profession').value).toBe('Laboureur');
      expect(input(element, 'Date de naissance').value).toBe('14 MAR 1850');
      expect(input(element, 'Lieu de naissance').value).toBe('Lyon');
      expect(input(element, 'Date de décès').value).toBe('ABT 1910');
      expect(input(element, 'Lieu de décès').value).toBe('Paris');
      expect(element.textContent).toContain('Formats acceptés : 12/03/1850');
    });

    it('cannot be sent without a change', async () => {
      const fixture = render(EditPersonDialog);
      const element = fixture.nativeElement as HTMLElement;
      expect(submitButton(element).disabled).toBe(true);

      // Spaces around a value are not a change.
      type(element, 'Prénoms', ' Jean ');
      await fixture.whenStable();
      expect(submitButton(element).disabled).toBe(true);
    });

    it('sends only the changed fields, with the comment', async () => {
      const fixture = render(EditPersonDialog);
      const element = fixture.nativeElement as HTMLElement;
      type(element, 'Prénoms', 'Jean Baptiste');
      type(element, 'Lieu de décès', '');
      type(element, 'Commentaire', '  Acte de baptême  ');
      await fixture.whenStable();
      submitButton(element).click();
      await fixture.whenStable();

      expect(api.propose).toHaveBeenCalledWith({
        kind: 'edit',
        personId: 'I1',
        fields: { givenNames: 'Jean Baptiste', deathPlace: '' },
        comment: 'Acte de baptême',
      });
      expect(notifications.show).toHaveBeenCalledWith('success', 'contributions.thanks');
      expect(close).toHaveBeenCalledWith([{ id: 1 }]);
      // The proposal shows in the tree of its author: cached people are stale.
      expect(api.clearCache).toHaveBeenCalled();
    });

    it('stays open and shows the server message when the proposal is refused', async () => {
      const error = new Error('Date non reconnue');
      api.propose.mockRejectedValue(error);
      const fixture = render(EditPersonDialog);
      const element = fixture.nativeElement as HTMLElement;
      type(element, 'Date de naissance', '32/13/1850');
      await fixture.whenStable();
      submitButton(element).click();
      await fixture.whenStable();

      expect(notifications.error).toHaveBeenCalledWith(error);
      expect(close).not.toHaveBeenCalled();
    });
  });

  describe('AddRelativeDialog', () => {
    const unions = [{ familyId: 'F1', partnerName: 'DURAND Marie' }, { familyId: 'F2' }];

    it('suggests the surname of a man for his child, until another relation is chosen', async () => {
      const fixture = render(AddRelativeDialog);
      const element = fixture.nativeElement as HTMLElement;
      expect(choices(element, 'Lien de parenté').map((c) => c.label)).toEqual(['Enfant', 'Parents', 'Conjoint']);
      expect(input(element, 'Nom').value).toBe('MARTIN');
      choose(element, 'Lien de parenté', 'Conjoint');
      await fixture.whenStable();
      expect(input(element, 'Nom').value).toBe('');
    });

    it('does not suggest the surname of a woman', () => {
      const element = render(AddRelativeDialog, person({ id: 'I3', sex: 'F', surname: 'DURAND' }))
        .nativeElement as HTMLElement;
      expect(input(element, 'Nom').value).toBe('');
    });

    it('requires a given name or a surname', async () => {
      const fixture = render(AddRelativeDialog, person({ id: 'I3', sex: 'F', surname: 'DURAND' }));
      const element = fixture.nativeElement as HTMLElement;
      expect(submitButton(element).disabled).toBe(true);
      type(element, 'Date de naissance', '1850');
      await fixture.whenStable();
      expect(submitButton(element).disabled).toBe(true);
      // The given names may be unknown.
      type(element, 'Nom', 'DURAND');
      await fixture.whenStable();
      expect(submitButton(element).disabled).toBe(false);
    });

    it('sends a child with the chosen other parent', async () => {
      const fixture = render(AddRelativeDialog, jean, unions);
      const element = fixture.nativeElement as HTMLElement;
      const otherParent = input(element, 'Autre parent') as HTMLSelectElement;
      expect([...otherParent.options].map((option) => option.textContent.trim())).toEqual([
        'DURAND Marie',
        'Conjoint inconnu',
        'Non connu',
      ]);
      type(element, 'Autre parent', 'F2');
      type(element, 'Prénoms', 'Pierre');
      choose(element, 'Sexe', 'Homme');
      type(element, 'Date de naissance', 'vers 1880');
      await fixture.whenStable();
      submitButton(element).click();
      await fixture.whenStable();

      expect(api.propose).toHaveBeenCalledWith({
        kind: 'add-person',
        personId: 'I1',
        relation: 'child',
        familyId: 'F2',
        fields: { givenNames: 'Pierre', surname: 'MARTIN', sex: 'M', birthDate: 'vers 1880' },
      });
      expect(close).toHaveBeenCalledWith([{ id: 1 }]);
    });

    it('sends a child whose other parent is unknown', async () => {
      const fixture = render(AddRelativeDialog, jean, unions);
      const element = fixture.nativeElement as HTMLElement;
      type(element, 'Autre parent', '');
      type(element, 'Prénoms', 'Pierre');
      await fixture.whenStable();
      submitButton(element).click();
      await fixture.whenStable();

      expect(api.propose).toHaveBeenCalledWith(expect.not.objectContaining({ familyId: expect.anything() as unknown }));
    });

    it('sends a spouse with the details of the union', async () => {
      const fixture = render(AddRelativeDialog, jean, unions);
      const element = fixture.nativeElement as HTMLElement;
      choose(element, 'Lien de parenté', 'Conjoint');
      await fixture.whenStable();
      expect(element.querySelector('select')).toBeNull();
      type(element, 'Prénoms', 'Louise');
      type(element, 'Nom', 'PETIT');
      choose(element, 'Sexe', 'Femme');
      type(element, 'Date du mariage', '1875');
      await fixture.whenStable();
      submitButton(element).click();
      await fixture.whenStable();

      expect(api.propose).toHaveBeenCalledWith({
        kind: 'add-person',
        personId: 'I1',
        relation: 'spouse',
        fields: { givenNames: 'Louise', surname: 'PETIT', sex: 'F' },
        union: { marriageDate: '1875' },
      });
    });

    it('sends a spouse joining the children already proposed, as their other parent', async () => {
      const fixture = render(AddRelativeDialog, person({ id: 'I3', sex: 'F', surname: 'DURAND' }), [
        { familyId: 'F1', partnerName: 'MARTIN Jean' },
        { familyId: 'WF7', partnerless: true, childNames: ['DURAND Paul', 'DURAND Lise'] },
      ]);
      const element = fixture.nativeElement as HTMLElement;
      choose(element, 'Lien de parenté', 'Conjoint');
      await fixture.whenStable();
      const shared = input(element, 'Autre parent de') as HTMLSelectElement;
      expect([...shared.options].map((option) => option.textContent.trim())).toEqual([
        'DURAND Paul, DURAND Lise',
        'Aucun enfant en commun (nouvelle union)',
      ]);
      type(element, 'Prénoms', 'Louis');
      await fixture.whenStable();
      submitButton(element).click();
      await fixture.whenStable();

      expect(api.propose).toHaveBeenCalledWith({
        kind: 'add-person',
        personId: 'I3',
        relation: 'spouse',
        familyId: 'WF7',
        fields: { givenNames: 'Louis', sex: 'U' },
      });
    });

    it('sends the missing parent with the details of the parents union', async () => {
      const fixture = render(AddRelativeDialog, jean, [], { parents: { father: 'MARTIN Pierre' } });
      const element = fixture.nativeElement as HTMLElement;
      choose(element, 'Lien de parenté', 'Parents');
      await fixture.whenStable();
      expect(element.textContent).toContain('Déjà connu : MARTIN Pierre');
      // The sex of a parent is given by their role.
      expect(element.querySelector('[role="radiogroup"][aria-label="Sexe"]')).toBeNull();
      expect(submitButton(element).disabled).toBe(true);
      type(element, 'Date de naissance', '1820');
      await fixture.whenStable();
      // A date without a name: not enough.
      expect(submitButton(element).disabled).toBe(true);
      type(element, 'Prénoms', 'Anne');
      type(element, 'Nom', 'ROUX');
      type(element, 'Lieu du mariage', 'Lyon');
      await fixture.whenStable();
      submitButton(element).click();
      await fixture.whenStable();

      expect(api.propose).toHaveBeenCalledWith({
        kind: 'add-parents',
        personId: 'I1',
        mother: { givenNames: 'Anne', surname: 'ROUX', sex: 'F', birthDate: '1820' },
        union: { marriagePlace: 'Lyon' },
      });
    });

    it('sends both parents, the father suggested with the surname of the person', async () => {
      const fixture = render(AddRelativeDialog);
      const element = fixture.nativeElement as HTMLElement;
      choose(element, 'Lien de parenté', 'Parents');
      await fixture.whenStable();
      const [fatherGivenNames, motherGivenNames] = [...element.querySelectorAll('fieldset')]
        .slice(0, 2)
        .map((fieldset) => input(fieldset, 'Prénoms'));
      expect(input(element.querySelector('fieldset')!, 'Nom').value).toBe('MARTIN');
      for (const [control, value] of [
        [fatherGivenNames!, 'Pierre'],
        [motherGivenNames!, 'Anne'],
      ] as const) {
        control.value = value;
        control.dispatchEvent(new Event('input'));
      }
      const motherSurname = input(element.querySelectorAll('fieldset')[1]!, 'Nom');
      motherSurname.value = 'ROUX';
      motherSurname.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      submitButton(element).click();
      await fixture.whenStable();

      expect(api.propose).toHaveBeenCalledWith({
        kind: 'add-parents',
        personId: 'I1',
        father: { givenNames: 'Pierre', surname: 'MARTIN', sex: 'M' },
        mother: { givenNames: 'Anne', surname: 'ROUX', sex: 'F' },
      });
    });

    it('cannot add parents when both are known', () => {
      const element = render(AddRelativeDialog, jean, [], { parents: { father: 'A', mother: 'B' } })
        .nativeElement as HTMLElement;
      expect(choices(element, 'Lien de parenté').find((c) => c.label === 'Parents')!.input.disabled).toBe(true);
    });
  });

  describe('EditUnionDialog', () => {
    it('sends only the changed details of the union', async () => {
      const fixture = render(EditUnionDialog, jean, [], {
        union: { familyId: 'F1', partnerName: 'DURAND Marie', values: { marriageDate: '1875', marriagePlace: '' } },
      });
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('h2')!.textContent).toContain('Union de MARTIN Jean et DURAND Marie');
      expect(input(element, 'Date du mariage').value).toBe('1875');
      expect(submitButton(element).disabled).toBe(true);
      type(element, 'Lieu du mariage', 'Lyon');
      await fixture.whenStable();
      submitButton(element).click();
      await fixture.whenStable();

      expect(api.propose).toHaveBeenCalledWith({
        kind: 'edit-union',
        personId: 'I1',
        familyId: 'F1',
        fields: { marriagePlace: 'Lyon' },
      });
    });
  });

  describe('AddMediaDialog', () => {
    it('sends the chosen file with its title', async () => {
      const fixture = render(AddMediaDialog);
      const element = fixture.nativeElement as HTMLElement;
      expect(submitButton(element).disabled).toBe(true);

      const file = new File(['%PDF'], 'acte.pdf', { type: 'application/pdf' });
      const fileInput = element.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event('change'));
      type(element, 'Titre', 'Acte de mariage');
      await fixture.whenStable();
      submitButton(element).click();
      await fixture.whenStable();

      expect(api.proposeMedia).toHaveBeenCalledWith('I1', file, { title: 'Acte de mariage' });
      expect(close).toHaveBeenCalledWith([{ id: 2 }]);
    });
  });
});
