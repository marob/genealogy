import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, provideRouter, Router, type RouterStateSnapshot, UrlTree } from '@angular/router';
import { adminGuard } from './guards';
import { SessionStore } from './session.store';

describe('guards', () => {
  const run = (guard: typeof adminGuard, session: Partial<Record<'isAdmin' | 'isAuthenticated', () => boolean>>) => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: SessionStore, useValue: session }] });
    const result = TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url: '/account' } as RouterStateSnapshot),
    );
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
  };

  it('laisse passer un administrateur', () => {
    expect(run(adminGuard, { isAdmin: () => true })).toBe(true);
  });

  it('renvoie les non-administrateurs vers l’accueil', () => {
    expect(run(adminGuard, { isAdmin: () => false })).toBe('/');
  });
});
