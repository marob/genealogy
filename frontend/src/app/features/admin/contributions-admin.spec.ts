import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ContributionDto } from '@genealogie/shared';
import { provideTestTransloco } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { ConfirmService } from '../../ui/confirm-dialog';
import { ContributionsAdmin } from './contributions-admin';

const edit: ContributionDto = {
  id: 1,
  kind: 'edit',
  status: 'pending',
  personId: 'I1',
  person: { givenNames: 'Jean', surname: 'MARTIN' },
  fields: { birthPlace: 'Lyon', sex: 'F' },
  previous: { sex: 'M' },
  comment: 'Acte de naissance',
  author: { id: 3, name: 'Louis' },
  createdAt: '2026-11-01T10:00:00Z',
};

const addChild: ContributionDto = {
  id: 2,
  kind: 'add-person',
  status: 'pending',
  personId: 'I1',
  person: { givenNames: 'Jean', surname: 'MARTIN' },
  relation: 'child',
  fields: { givenNames: 'Pierre', surname: 'MARTIN', birthDate: 'vers 1880' },
  createdAt: '2026-11-02T10:00:00Z',
};

const photo: ContributionDto = {
  id: 3,
  kind: 'add-media',
  status: 'approved',
  personId: 'I1',
  person: { givenNames: 'Jean', surname: 'MARTIN' },
  fields: {},
  media: { fileName: 'portrait.jpg', mimeType: 'image/jpeg', title: 'Portrait', available: true },
  createdAt: '2026-11-03T10:00:00Z',
};

describe('ContributionsAdmin', () => {
  const api = {
    contributions: vi.fn(),
    reviewContribution: vi.fn(),
    exportContributions: vi.fn(),
  };
  const confirm = vi.fn();

  beforeEach(() => {
    api.contributions
      .mockReset()
      .mockImplementation((status?: string) => Promise.resolve(status === 'approved' ? [photo] : [edit, addChild]));
    api.reviewContribution.mockReset().mockResolvedValue({});
    api.exportContributions.mockReset().mockResolvedValue(new Blob(['PK']));
    confirm.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: ConfirmService, useValue: { confirm } },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(ContributionsAdmin);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function button(element: HTMLElement, text: string, index = 0) {
    return [...element.querySelectorAll<HTMLButtonElement>('button')].filter((candidate) =>
      candidate.textContent.includes(text),
    )[index]!;
  }

  it('lists the pending contributions by default', async () => {
    const element = (await render()).nativeElement as HTMLElement;
    expect(api.contributions).toHaveBeenCalledWith('pending');
    const items = element.querySelectorAll('.contributions > li');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('En attente');
    expect(items[0]!.textContent).toContain('Louis');
    expect(items[0]!.querySelector('a')!.getAttribute('href')).toBe('/tree/I1');
  });

  it('shows the current and proposed values of an edit', async () => {
    const element = (await render()).nativeElement as HTMLElement;
    const rows = [...element.querySelectorAll('.contributions > li')[0]!.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('th, td')].map((cell) => cell.textContent.trim()),
    );
    expect(rows).toEqual([
      ['Sexe', 'Homme', 'Femme'],
      ['Lieu de naissance', 'non renseigné', 'Lyon'],
    ]);
    expect(element.querySelector('.comment')!.textContent).toContain('Acte de naissance');
  });

  it('shows the relation and the fields of a new relative', async () => {
    const element = (await render()).nativeElement as HTMLElement;
    const item = element.querySelectorAll('.contributions > li')[1]!;
    expect(item.querySelector('.relation')!.textContent).toContain('Nouvel enfant');
    expect(item.querySelector('dl')!.textContent).toContain('Pierre');
    expect(item.querySelector('dl')!.textContent).toContain('vers 1880');
  });

  it('shows a proposed image as a thumbnail', async () => {
    api.contributions.mockResolvedValue([photo]);
    const element = (await render()).nativeElement as HTMLElement;
    expect(element.querySelector('.media img')!.getAttribute('src')).toBe('/api/admin/contributions/3/media');
    // Not pending: no review actions.
    expect(element.querySelector('.contributions .actions')).toBeNull();
  });

  it('filters by status', async () => {
    const fixture = await render();
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('.status-filter select')!;
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(api.contributions).toHaveBeenLastCalledWith(undefined);
  });

  it('accepts a contribution and refreshes the list', async () => {
    const fixture = await render();
    api.contributions.mockClear();
    button(fixture.nativeElement as HTMLElement, 'Accepter').click();
    await fixture.whenStable();
    expect(confirm).not.toHaveBeenCalled();
    expect(api.reviewContribution).toHaveBeenCalledWith(1, { status: 'approved' });
    expect(api.contributions).toHaveBeenCalledWith('pending');
    expect(api.contributions).toHaveBeenCalledWith('approved');
  });

  it('rejects a contribution after confirmation', async () => {
    const fixture = await render();
    button(fixture.nativeElement as HTMLElement, 'Refuser', 1).click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ params: { person: 'MARTIN Jean' } }));
    expect(api.reviewContribution).toHaveBeenCalledWith(2, { status: 'rejected' });
  });

  it('does not reject a contribution when the confirmation is cancelled', async () => {
    confirm.mockResolvedValue(false);
    const fixture = await render();
    button(fixture.nativeElement as HTMLElement, 'Refuser').click();
    await fixture.whenStable();
    expect(api.reviewContribution).not.toHaveBeenCalled();
  });

  it('cannot export without approved contributions', async () => {
    api.contributions.mockResolvedValue([]);
    const element = (await render()).nativeElement as HTMLElement;
    const exportButton = element.querySelector<HTMLButtonElement>('.export')!;
    expect(exportButton.textContent).toContain('Exporter pour Généatique (0)');
    expect(exportButton.disabled).toBe(true);
  });

  it('downloads the export of the approved contributions', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 8, 12));
    const createObjectURL = vi.fn(() => 'blob:export');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      const fixture = await render();
      const exportButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.export')!;
      expect(exportButton.textContent).toContain('Exporter pour Généatique (1)');
      api.contributions.mockClear();
      exportButton.click();
      await fixture.whenStable();

      expect(api.exportContributions).toHaveBeenCalled();
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      const download = click.mock.contexts[0] as HTMLAnchorElement | undefined;
      expect(download?.download).toBe('contributions-2026-11-08.zip');
      expect(download?.href).toBe('blob:export');
      expect(api.contributions).toHaveBeenCalledWith('approved');
    } finally {
      click.mockRestore();
      vi.useRealTimers();
    }
  });
});
