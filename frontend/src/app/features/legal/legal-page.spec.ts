import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestTransloco } from '../../../testing/test-helpers';
import { SessionStore } from '../../core/session.store';
import { LegalPage } from './legal-page';

describe('LegalPage', () => {
  const contactEmail = signal<string | undefined>(undefined);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTestTransloco(), provideRouter([]), { provide: SessionStore, useValue: { contactEmail } }],
    });
  });

  async function render(page: 'privacy' | 'terms') {
    const fixture = TestBed.createComponent(LegalPage);
    fixture.componentRef.setInput('page', page);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the privacy policy with the data deletion instructions', async () => {
    const element = await render('privacy');
    expect(element.querySelector('h1')?.textContent).toContain('Politique de confidentialité');
    expect(element.querySelector('#deletion')?.textContent).toContain('Supprimer mon compte');
    expect(element.querySelector('#contact')?.textContent).toContain('l’administrateur du site');
  });

  it('shows the terms of use with the source code link and the contact address', async () => {
    contactEmail.set('contact@example.com');
    const element = await render('terms');
    expect(element.querySelector('h1')?.textContent).toContain('Conditions d’utilisation');
    expect(element.querySelector('#source a')?.getAttribute('href')).toBe('https://github.com/marob/genealogy');
    expect(element.querySelector('#contact')?.textContent).toContain('contact@example.com');
  });
});
