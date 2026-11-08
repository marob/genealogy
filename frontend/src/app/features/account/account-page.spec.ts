import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ContributionDto, UserDto } from '@genealogie/shared';
import { person, provideTestTransloco } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { SessionStore } from '../../core/session.store';
import { ConfirmService } from '../../ui/confirm-dialog';
import { AccountPage } from './account-page';

describe('AccountPage', () => {
  const user = signal<UserDto>({
    id: 1,
    email: 'louis@example.com',
    role: 'MEMBER',
    canSeeContemporary: true,
    createdAt: '2026-01-01T00:00:00Z',
  });
  const setPersonalRoot = vi.fn(() => {
    const { rootPersonId: _removed, ...rest } = user();
    user.set(rest);
    return Promise.resolve();
  });

  const deleteAccount = vi.fn(() => Promise.resolve());
  const confirm = vi.fn(() => Promise.resolve(true));
  const myContributions = vi.fn<() => Promise<ContributionDto[]>>();
  const withdrawContribution = vi.fn(() => Promise.resolve());
  const clearCache = vi.fn();

  beforeEach(() => {
    deleteAccount.mockClear();
    myContributions.mockReset().mockResolvedValue([]);
    withdrawContribution.mockClear();
    clearCache.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        provideRouter([]),
        {
          provide: SessionStore,
          useValue: {
            user,
            setPersonalRoot,
            deleteAccount,
            canSeeContemporary: () => true,
            providerList: () => 'Google',
          },
        },
        {
          provide: ApiService,
          useValue: {
            person: (id: string) => Promise.resolve(person({ id, givenNames: 'Louis' })),
            myContributions,
            withdrawContribution,
            clearCache,
          },
        },
        { provide: ConfirmService, useValue: { confirm } },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(AccountPage);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the shared root when no personal root is set', async () => {
    expect((await render()).querySelector('.root')?.textContent).toContain('Racine commune');
  });

  it('shows the personal root and allows going back to the shared root', async () => {
    user.update((value) => ({ ...value, rootPersonId: 'I23' }));
    const element = await render();
    const link = element.querySelector<HTMLAnchorElement>('.root a')!;
    expect(link.textContent).toContain('MARTIN Louis');
    expect(link.getAttribute('href')).toBe('/tree/I23');

    element.querySelector<HTMLButtonElement>('.root button')!.click();
    expect(setPersonalRoot).toHaveBeenCalledWith(null);
  });

  it('lists the contributions of the user', async () => {
    myContributions.mockResolvedValue([
      {
        id: 7,
        kind: 'edit',
        status: 'pending',
        personId: 'I5',
        person: { givenNames: 'Jean', surname: 'MARTIN' },
        fields: { birthPlace: 'Lyon', occupation: '' },
        createdAt: '2026-11-01T10:00:00Z',
      },
      {
        id: 8,
        kind: 'add-person',
        status: 'exported',
        personId: 'I5',
        person: { givenNames: 'Jean', surname: 'MARTIN' },
        relation: 'child',
        fields: { givenNames: 'Pierre', surname: 'MARTIN' },
        createdAt: '2026-11-02T10:00:00Z',
      },
    ]);
    const element = await render();
    const items = [...element.querySelectorAll('.contributions li')];
    expect(items).toHaveLength(2);
    expect(items[0]!.querySelector('.badge')!.textContent).toContain('En attente');
    expect(items[0]!.querySelector('a')!.getAttribute('href')).toBe('/tree/I5');
    const text = (item: Element) => item.textContent.replace(/\s+/g, ' ');
    expect(text(items[0]!)).toContain('Profession : effacé · Lieu de naissance : Lyon');
    expect(items[1]!.querySelector('.badge')!.textContent).toContain('Transmise');
    expect(text(items[1]!)).toContain('Nouvel enfant : Pierre MARTIN');
    // Only pending contributions can be withdrawn.
    expect(items[1]!.querySelector('.withdraw')).toBeNull();

    items[0]!.querySelector<HTMLButtonElement>('.withdraw')!.click();
    await vi.waitFor(() => expect(withdrawContribution).toHaveBeenCalledWith(7));
    // The withdrawn proposal no longer shows in the tree.
    expect(clearCache).toHaveBeenCalled();
  });

  it('deletes the account after confirmation', async () => {
    const element = await render();
    element.querySelector<HTMLButtonElement>('.btn-danger')!.click();
    await vi.waitFor(() => expect(deleteAccount).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
  });

  it('does nothing when the deletion is cancelled', async () => {
    confirm.mockResolvedValueOnce(false);
    const element = await render();
    element.querySelector<HTMLButtonElement>('.btn-danger')!.click();
    await fixtureSettled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});

function fixtureSettled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}
