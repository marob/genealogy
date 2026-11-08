import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MediaDto, PersonDto } from '@genealogie/shared';
import { person, provideTestTransloco } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { SessionStore } from '../../core/session.store';
import { ConfirmService } from '../../ui/confirm-dialog';
import { MediaViewerService } from '../../ui/media-viewer';
import { TreeController } from './tree-controller';
import { ContributionDialogs } from '../contributions/contribution-dialogs';
import { PersonDetails } from './person-details';

const photo: MediaDto = { id: 1, fileName: 'portrait.jpg', mimeType: 'image/jpeg', available: true };
const birthRecord: MediaDto = {
  id: 2,
  fileName: 'naissance.jpg',
  title: 'Acte de naissance',
  mimeType: 'image/png',
  eventType: 'BIRT',
  available: true,
};
const census: MediaDto = { id: 3, fileName: 'recensement.pdf', mimeType: 'application/pdf', available: true };
const missing: MediaDto = { id: 4, fileName: 'perdu.jpg', available: false };
const marriage: MediaDto = {
  id: 5,
  fileName: 'mariage.jpg',
  mimeType: 'image/jpeg',
  eventType: 'MARR',
  available: true,
};

describe('PersonDetails', () => {
  const isAdmin = signal(false);
  const isAuthenticated = signal(false);
  const open = vi.fn();
  const openContribution = vi.fn();
  const people = vi.fn();
  const reload = vi.fn();
  const withdrawContribution = vi.fn();
  const confirm = vi.fn();
  const root = signal<{ person: PersonDto } | undefined>(undefined);
  const focus = vi.fn();
  const select = vi.fn();

  beforeEach(() => {
    isAdmin.set(false);
    isAuthenticated.set(false);
    open.mockReset();
    openContribution.mockReset().mockResolvedValue([]);
    withdrawContribution.mockReset().mockResolvedValue(undefined);
    confirm.mockReset().mockResolvedValue(true);
    root.set(undefined);
    focus.mockReset();
    select.mockReset();
    people.mockReset().mockResolvedValue([]);
    reload.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        { provide: ApiService, useValue: { people, withdrawContribution, clearCache: vi.fn() } },
        { provide: ConfirmService, useValue: { confirm } },
        { provide: SessionStore, useValue: { isAdmin, isAuthenticated, user: signal(undefined) } },
        { provide: MediaViewerService, useValue: { open } },
        { provide: ContributionDialogs, useValue: { open: openContribution } },
        { provide: TreeController, useValue: { reload, root, focus, select } },
      ],
    });
  });

  async function render(value: PersonDto) {
    const fixture = TestBed.createComponent(PersonDetails);
    fixture.componentRef.setInput('person', value);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const withDocuments = person({
    id: 'I1',
    media: [photo, birthRecord, census, missing],
    unions: [{ familyId: 'F1', childIds: [], events: [], restricted: false, media: [marriage] }],
  });

  it('shows no documents section without documents', async () => {
    const element = await render(person({ id: 'I1' }));
    expect(element.querySelector('app-media-list')).toBeNull();
    expect(element.querySelector('.portrait')).toBeNull();
  });

  it('shows the images as thumbnails and the other files as links', async () => {
    const element = await render(withDocuments);
    const [own] = element.querySelectorAll('app-media-list');
    const thumbnails = [...own!.querySelectorAll<HTMLImageElement>('.thumbnail img')];
    expect(thumbnails.map((img) => img.getAttribute('src'))).toEqual([
      '/api/media/1/thumbnail',
      '/api/media/2/thumbnail',
    ]);
    expect(thumbnails.map((img) => img.alt)).toEqual(['portrait.jpg', 'Acte de naissance']);
    expect(thumbnails[0]!.getAttribute('loading')).toBe('lazy');
    expect(own!.querySelector('.thumbnails')!.textContent).toContain('Naissance');

    const link = own!.querySelector<HTMLAnchorElement>('.files a')!;
    expect(link.getAttribute('href')).toBe('/api/media/3');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');
    expect(link.textContent).toContain('recensement.pdf');
  });

  it('opens the viewer on the clicked image, among the images of the same list', async () => {
    const element = await render(withDocuments);
    element.querySelectorAll<HTMLButtonElement>('.thumbnail')[1]!.click();
    expect(open).toHaveBeenCalledWith([photo, birthRecord], 1);
  });

  it('shows the documents of a union in its block', async () => {
    const element = await render(withDocuments);
    const lists = element.querySelectorAll('app-media-list');
    expect(lists).toHaveLength(2);
    expect(lists[1]!.querySelector('img')!.getAttribute('src')).toBe('/api/media/5/thumbnail');
    expect(lists[1]!.textContent).toContain('Mariage');
  });

  it('hides the documents not provided from normal users', async () => {
    const element = await render(withDocuments);
    expect(element.querySelector('.missing')).toBeNull();
    expect(element.textContent).not.toContain('perdu.jpg');

    // A person with only missing documents has no documents section at all.
    const onlyMissing = await render(person({ id: 'I2', media: [missing] }));
    expect(onlyMissing.querySelector('app-media-list')).toBeNull();
  });

  it('lists the documents not provided for administrators', async () => {
    isAdmin.set(true);
    const element = await render(withDocuments);
    const details = element.querySelector('.missing')!;
    expect(details.querySelector('summary')!.textContent).toContain('1 document(s) non fourni(s)');
    expect(details.textContent).toContain('perdu.jpg');
  });

  it('shows the first photo not attached to an event as a portrait', async () => {
    const element = await render(withDocuments);
    const portrait = element.querySelector<HTMLButtonElement>('header .portrait')!;
    expect(portrait.querySelector('img')!.getAttribute('src')).toBe('/api/media/1/thumbnail');
    portrait.click();
    expect(open).toHaveBeenCalledWith([photo, birthRecord], 0);
  });

  it('does not use a scanned record as a portrait', async () => {
    const element = await render(person({ id: 'I1', media: [birthRecord] }));
    expect(element.querySelector('header .portrait')).toBeNull();
  });

  describe('change proposals', () => {
    function proposeButtons(element: HTMLElement) {
      return [...element.querySelectorAll<HTMLButtonElement>('.propose button')];
    }

    it('are not offered to anonymous visitors', async () => {
      const element = await render(person({ id: 'I1' }));
      expect(element.querySelector('.propose')).toBeNull();
    });

    it('are offered to signed-in members', async () => {
      isAuthenticated.set(true);
      const element = await render(person({ id: 'I1' }));
      expect(element.querySelector('.propose summary')!.textContent).toContain('Proposer une modification');
      expect(proposeButtons(element).map((button) => button.textContent.trim())).toEqual([
        'Corriger la fiche',
        'Ajouter un proche',
        'Ajouter un document',
      ]);
    });

    it('are not offered for a person whose details are restricted', async () => {
      isAuthenticated.set(true);
      const element = await render(person({ id: 'I1', restricted: true }));
      expect(element.querySelector('.propose')).toBeNull();
    });

    it('open the dialog with the person, their parents and the partners of their unions', async () => {
      isAuthenticated.set(true);
      people.mockResolvedValue([
        person({ id: 'I2', givenNames: 'Marie', surname: 'DURAND', sex: 'F' }),
        person({ id: 'I0', givenNames: 'Pierre' }),
      ]);
      const subject = person({
        id: 'I1',
        fatherId: 'I0',
        unions: [
          { familyId: 'F1', partnerId: 'I2', childIds: [], events: [], restricted: false, media: [] },
          { familyId: 'F2', childIds: [], events: [], restricted: false, media: [] },
        ],
      });
      const element = await render(subject);
      proposeButtons(element)[1]!.click();
      expect(openContribution).toHaveBeenCalledWith('add-person', {
        person: subject,
        personName: 'MARTIN Jean',
        unions: [
          { familyId: 'F1', partnerName: 'DURAND Marie' },
          // A union without a second partner, that a new spouse can join.
          { familyId: 'F2', partnerless: true, childNames: [] },
        ],
        parents: { father: 'MARTIN Pierre' },
      });
    });

    it('propose the details of a union', async () => {
      isAuthenticated.set(true);
      people.mockResolvedValue([person({ id: 'I2', givenNames: 'Marie', surname: 'DURAND', sex: 'F' })]);
      const wedding = {
        type: 'MARR',
        date: { original: '1875', qualifier: 'exact' as const, calendar: 'gregorian' as const, start: { year: 1875 } },
      };
      const subject = person({
        id: 'I1',
        unions: [{ familyId: 'F1', partnerId: 'I2', childIds: [], events: [wedding], restricted: false, media: [] }],
      });
      const element = await render(subject);
      element.querySelector<HTMLButtonElement>('.union-title button')!.click();
      expect(openContribution).toHaveBeenCalledWith(
        'edit-union',
        expect.objectContaining({
          union: { familyId: 'F1', partnerName: 'DURAND Marie', values: { marriageDate: '1875', marriagePlace: '' } },
        }),
      );
    });
  });

  describe('proposals of the current user', () => {
    const birth = {
      type: 'BIRT',
      date: { original: '1850', qualifier: 'exact' as const, calendar: 'gregorian' as const, start: { year: 1850 } },
    };
    const occupation = { type: 'OCCU', value: 'Laboureur' };

    function marked(element: HTMLElement): string[] {
      return [...element.querySelectorAll('.pending-marker')].map((marker) => {
        const line = marker.closest('li, h2')!;
        return line.querySelector('strong')?.textContent.trim() ?? 'name';
      });
    }

    it('shows no notice without proposal', async () => {
      const element = await render(person({ id: 'I1', events: [birth] }));
      expect(element.querySelector('.proposal-notice')).toBeNull();
      expect(element.querySelector('.pending-marker')).toBeNull();
    });

    it('flags a proposed person', async () => {
      const element = await render(
        person({ id: 'W12', events: [birth], proposal: { status: 'pending', isNew: true } }),
      );
      expect(element.querySelector('.proposal-notice')!.textContent).toContain(
        'Personne que vous avez proposée — en attente de validation',
      );
      // The whole record is proposed: no marker on each line.
      expect(element.querySelector('.pending-marker')).toBeNull();
    });

    it('flags the proposed fields of an edited person', async () => {
      const element = await render(
        person({
          id: 'I1',
          occupation: 'Boulanger',
          events: [birth, occupation, { type: 'DEAT' }],
          proposal: { status: 'pending', fields: ['surname', 'birthPlace', 'occupation'] },
        }),
      );
      expect(element.querySelector('.proposal-notice')!.textContent).toContain(
        'Certaines informations viennent de vos propositions, en attente de validation',
      );
      expect(marked(element)).toEqual(['name', 'Profession', 'Naissance']);
      // The proposed occupation replaces the occupation events.
      expect(element.textContent).toContain('Boulanger');
      expect(element.textContent).not.toContain('Laboureur');
    });

    it('tells when the proposals were accepted', async () => {
      const element = await render(
        person({ id: 'I1', events: [birth], proposal: { status: 'exported', fields: ['birthDate'] } }),
      );
      expect(element.querySelector('.proposal-notice')!.textContent).toContain('acceptées et en attente de report');
      expect(element.querySelector('.pending-marker')!.textContent.trim()).toBe('acceptée');
    });

    it('are possible on a proposed person', async () => {
      isAuthenticated.set(true);
      const element = await render(person({ id: 'W12', proposal: { status: 'pending', isNew: true } }));
      expect(element.querySelectorAll('.propose button')).toHaveLength(3);
    });

    it('reload the tree after a proposal is sent, showing the new parents', async () => {
      isAuthenticated.set(true);
      const element = await render(person({ id: 'I1' }));
      openContribution.mockResolvedValue([{ id: 3, kind: 'add-person', relation: 'parent' }]);
      element.querySelector<HTMLButtonElement>('.propose button')!.click();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledWith({ personId: 'I1', direction: 'parents' }));
    });

    it('withdraw a proposed person, with the proposals about them', async () => {
      const element = await render(
        person({ id: 'W12', proposal: { status: 'pending', isNew: true, pending: [12, 15] } }),
      );
      const button = element.querySelector<HTMLButtonElement>('.proposal-notice button')!;
      expect(button.textContent.trim()).toBe('Retirer cette personne');
      button.click();
      await vi.waitFor(() => expect(reload).toHaveBeenCalled());
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'contributions.overlay.withdrawNew' }));
      expect(withdrawContribution.mock.calls).toEqual([[12]]);
    });

    it('centre the tree on a relative when the withdrawn person was its root', async () => {
      const proposed = person({
        id: 'W12',
        unions: [{ familyId: 'WF12', partnerId: 'I5', childIds: [], events: [], restricted: false, media: [] }],
        proposal: { status: 'pending', isNew: true, pending: [12] },
      });
      root.set({ person: proposed });
      const element = await render(proposed);
      element.querySelector<HTMLButtonElement>('.proposal-notice button')!.click();
      await vi.waitFor(() => expect(focus).toHaveBeenCalledWith({ id: 'I5' }));
      expect(select).toHaveBeenCalledWith(undefined);
      expect(reload).not.toHaveBeenCalled();
    });

    it('withdraw the proposed values of a record', async () => {
      const element = await render(
        person({ id: 'I1', proposal: { status: 'pending', fields: ['occupation'], pending: [4, 7] } }),
      );
      element.querySelector<HTMLButtonElement>('.proposal-notice button')!.click();
      await vi.waitFor(() => expect(reload).toHaveBeenCalled());
      expect(withdrawContribution.mock.calls).toEqual([[4], [7]]);
    });

    it('keep the proposals when the withdrawal is not confirmed', async () => {
      confirm.mockResolvedValue(false);
      const element = await render(
        person({ id: 'I1', proposal: { status: 'pending', fields: ['occupation'], pending: [4] } }),
      );
      element.querySelector<HTMLButtonElement>('.proposal-notice button')!.click();
      await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
      expect(withdrawContribution).not.toHaveBeenCalled();
    });

    it('cannot withdraw accepted proposals', async () => {
      const element = await render(person({ id: 'W12', proposal: { status: 'approved', isNew: true } }));
      expect(element.querySelector('.proposal-notice button')).toBeNull();
    });

    it('do not reload the tree when the dialog is cancelled', async () => {
      isAuthenticated.set(true);
      const element = await render(person({ id: 'I1' }));
      element.querySelector<HTMLButtonElement>('.propose button')!.click();
      await vi.waitFor(() => expect(openContribution).toHaveBeenCalled());
      await Promise.resolve();
      expect(reload).not.toHaveBeenCalled();
    });
  });
});
