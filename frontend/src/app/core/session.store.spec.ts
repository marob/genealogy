import { TestBed } from '@angular/core/testing';
import type { MeDto } from '@genealogie/shared';
import { ApiService } from './api.service';
import { SessionStore } from './session.store';
import { provideTestTransloco } from '../../testing/test-helpers';

describe('SessionStore', () => {
  const me = vi.fn<() => Promise<MeDto>>();
  const logout = vi.fn(() => Promise.resolve());
  const setMyRoot = vi.fn(() => Promise.resolve({ persons: 1, personalRoot: true }));
  let store: SessionStore;

  beforeEach(() => {
    me.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        { provide: ApiService, useValue: { me, logout, setMyRoot, clearCache: vi.fn() } },
      ],
    });
    store = TestBed.inject(SessionStore);
  });

  const user = (role: 'ADMIN' | 'MEMBER', canSeeContemporary: boolean) => ({
    id: 1,
    email: 'a@example.com',
    role,
    canSeeContemporary,
    createdAt: '2026-01-01T00:00:00Z',
  });

  it('exposes an anonymous visitor', async () => {
    me.mockResolvedValue({
      providers: [{ name: 'google', label: 'Google' }],
      devBypass: false,
      contemporaryPrivacy: 'names',
    });
    await store.load();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.canSeeContemporary()).toBe(false);
    expect(store.providers()).toEqual([{ name: 'google', label: 'Google' }]);
  });

  it('lists the configured identity providers for the texts', async () => {
    me.mockResolvedValue({
      providers: [
        { name: 'google', label: 'Google' },
        { name: 'microsoft', label: 'Microsoft' },
      ],
      devBypass: false,
      contemporaryPrivacy: 'names',
    });
    await store.load();
    expect(store.providerList()).toMatch(/^Google (ou|or|o) Microsoft$/);
  });

  it('computes the permissions of an authorized member', async () => {
    me.mockResolvedValue({ user: user('MEMBER', true), providers: [], devBypass: false, contemporaryPrivacy: 'names' });
    await store.load();
    expect(store.isAdmin()).toBe(false);
    expect(store.canSeeContemporary()).toBe(true);
  });

  it('grants all permissions to an administrator', async () => {
    me.mockResolvedValue({ user: user('ADMIN', false), providers: [], devBypass: false, contemporaryPrivacy: 'names' });
    await store.load();
    expect(store.isAdmin()).toBe(true);
    expect(store.canSeeContemporary()).toBe(true);
  });

  it('stays anonymous when the API is unavailable', async () => {
    me.mockRejectedValue(new Error('down'));
    await store.load();
    expect(store.user()).toBeUndefined();
  });

  it('saves the personal root then reloads the session', async () => {
    me.mockResolvedValue({
      user: { ...user('MEMBER', false), rootPersonId: 'I23' },
      providers: [],
      devBypass: false,
      contemporaryPrivacy: 'names',
    });
    await store.setPersonalRoot('I23');
    expect(setMyRoot).toHaveBeenCalledWith('I23');
    expect(store.user()?.rootPersonId).toBe('I23');
  });

  it('reloads the session after logout', async () => {
    me.mockResolvedValueOnce({
      user: user('MEMBER', false),
      providers: [],
      devBypass: false,
      contemporaryPrivacy: 'names',
    });
    await store.load();
    me.mockResolvedValueOnce({ providers: [], devBypass: false, contemporaryPrivacy: 'names' });
    await store.logout();
    expect(logout).toHaveBeenCalled();
    expect(store.isAuthenticated()).toBe(false);
  });
});
