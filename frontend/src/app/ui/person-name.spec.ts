import { TestBed } from '@angular/core/testing';
import { provideTestTransloco } from '../../testing/test-helpers';
import { NameOrderService } from '../core/name-order.service';
import { PersonName } from './person-name';

describe('PersonName', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
  });

  function render(person: { givenNames: string; surname: string; hidden?: boolean }) {
    const fixture = TestBed.createComponent(PersonName);
    fixture.componentRef.setInput('person', person);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the surname first by default', () => {
    const fixture = render({ givenNames: 'Émile', surname: 'MARTIN' });
    expect((fixture.nativeElement as HTMLElement).textContent.trim()).toBe('MARTIN Émile');
  });

  it('follows the chosen order and remembers it', () => {
    TestBed.inject(NameOrderService).use('given-first');
    const fixture = render({ givenNames: 'Émile', surname: 'MARTIN' });
    expect((fixture.nativeElement as HTMLElement).textContent.trim()).toBe('Émile MARTIN');
    expect(localStorage.getItem('genealogie.nameOrder')).toBe('given-first');
  });

  it('shows a placeholder for a hidden contemporary', () => {
    const fixture = render({ givenNames: '', surname: '', hidden: true });
    expect((fixture.nativeElement as HTMLElement).textContent.trim()).toBe('Personne contemporaine');
  });

  it('formats a plain-text label in the chosen order', () => {
    const names = TestBed.inject(NameOrderService);
    expect(names.format({ givenNames: 'Émile', surname: 'Martin' })).toBe('MARTIN Émile');
    names.use('given-first');
    expect(names.format({ givenNames: 'Émile', surname: 'Martin' })).toBe('Émile MARTIN');
  });
});
