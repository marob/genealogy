import { TestBed } from '@angular/core/testing';
import type { MeDto } from '@genealogie/shared';
import { ApiService } from './api.service';
import { SessionStore } from './session.store';

describe('SessionStore', () => {
  const me = vi.fn<() => Promise<MeDto>>();
  const logout = vi.fn(() => Promise.resolve());
  const setMyRoot = vi.fn(() => Promise.resolve({ persons: 1, personalRoot: true }));
  let store: SessionStore;

  beforeEach(() => {
    me.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: { me, logout, setMyRoot, clearCache: vi.fn() } }],
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

  it('expose un visiteur anonyme', async () => {
    me.mockResolvedValue({ providers: [{ name: 'google', label: 'Google' }], devBypass: false });
    await store.load();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.canSeeContemporary()).toBe(false);
    expect(store.providers()).toEqual([{ name: 'google', label: 'Google' }]);
  });

  it('calcule les droits d’un membre autorisé', async () => {
    me.mockResolvedValue({ user: user('MEMBER', true), providers: [], devBypass: false });
    await store.load();
    expect(store.isAdmin()).toBe(false);
    expect(store.canSeeContemporary()).toBe(true);
  });

  it('donne tous les droits à un administrateur', async () => {
    me.mockResolvedValue({ user: user('ADMIN', false), providers: [], devBypass: false });
    await store.load();
    expect(store.isAdmin()).toBe(true);
    expect(store.canSeeContemporary()).toBe(true);
  });

  it('reste anonyme si l’API est indisponible', async () => {
    me.mockRejectedValue(new Error('down'));
    await store.load();
    expect(store.user()).toBeUndefined();
  });

  it('enregistre la racine personnelle puis recharge la session', async () => {
    me.mockResolvedValue({ user: { ...user('MEMBER', false), rootPersonId: 'I23' }, providers: [], devBypass: false });
    await store.setPersonalRoot('I23');
    expect(setMyRoot).toHaveBeenCalledWith('I23');
    expect(store.user()?.rootPersonId).toBe('I23');
  });

  it('recharge la session après déconnexion', async () => {
    me.mockResolvedValueOnce({ user: user('MEMBER', false), providers: [], devBypass: false });
    await store.load();
    me.mockResolvedValueOnce({ providers: [], devBypass: false });
    await store.logout();
    expect(logout).toHaveBeenCalled();
    expect(store.isAuthenticated()).toBe(false);
  });
});
