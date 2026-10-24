import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { UserDto } from '@genealogie/shared';
import { person, provideTestTransloco } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { SessionStore } from '../../core/session.store';
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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        provideRouter([]),
        {
          provide: SessionStore,
          useValue: { user, setPersonalRoot, canSeeContemporary: () => true },
        },
        {
          provide: ApiService,
          useValue: { person: (id: string) => Promise.resolve(person({ id, givenNames: 'Louis' })) },
        },
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
});
