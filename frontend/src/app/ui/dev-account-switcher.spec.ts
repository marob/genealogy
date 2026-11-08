import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTestTransloco } from '../../testing/test-helpers';
import { ApiService } from '../core/api.service';
import { SessionStore } from '../core/session.store';
import { DevAccountSwitcher } from './dev-account-switcher';

describe('DevAccountSwitcher', () => {
  it('lists the test accounts and opens a session as the chosen one', async () => {
    const devLogin = vi.fn(() => Promise.resolve());
    const reload = vi
      .spyOn(DevAccountSwitcher.prototype as unknown as { reloadPage: () => void }, 'reloadPage')
      .mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        {
          provide: ApiService,
          useValue: {
            devLogin,
            devAccounts: () =>
              Promise.resolve([
                { email: 'dev@localhost', name: 'Developer', role: 'ADMIN', canSeeContemporary: true },
                { email: 'alice@localhost', name: 'Alice (membre)', role: 'MEMBER', canSeeContemporary: false },
              ]),
          },
        },
        { provide: SessionStore, useValue: { user: signal({ email: 'dev@localhost' }) } },
      ],
    });
    const fixture = TestBed.createComponent(DevAccountSwitcher);
    await fixture.whenStable();
    fixture.detectChanges();
    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    expect([...select.options].map((o) => [o.text.trim(), o.selected])).toEqual([
      ['Developer', true],
      ['Alice (membre)', false],
    ]);
    select.value = 'alice@localhost';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(devLogin).toHaveBeenCalledWith('alice@localhost');
    expect(reload).toHaveBeenCalled();
  });
});
