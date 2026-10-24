import { TestBed } from '@angular/core/testing';
import type { PersonDto } from '@genealogie/shared';
import { person, provideTestTransloco } from '../../../testing/test-helpers';
import { TreeController } from './tree-controller';
import { PersonCard } from './person-card';

function render(value: PersonDto, part: 'root' | 'parents' = 'root') {
  const fixture = TestBed.createComponent(PersonCard);
  fixture.componentRef.setInput('person', value);
  fixture.componentRef.setInput('part', part);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PersonCard', () => {
  const focus = vi.fn();
  const select = vi.fn();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTestTransloco(), { provide: TreeController, useValue: { focus, select } }],
    });
  });

  it('shows the name, occupation and key dates', () => {
    const element = render(
      person({
        id: 'I1',
        givenNames: 'Émile',
        occupation: 'Boulanger',
        events: [
          {
            type: 'BIRT',
            date: {
              original: '12 MAR 1850',
              qualifier: 'exact',
              calendar: 'gregorian',
              start: { year: 1850, month: 3, day: 12 },
            },
          },
          {
            type: 'DEAT',
            date: { original: 'ABT 1920', qualifier: 'about', calendar: 'gregorian', start: { year: 1920 } },
          },
        ],
      }),
    );
    expect(element.textContent).toContain('MARTIN Émile');
    expect(element.textContent).toContain('Boulanger');
    expect(element.textContent).toContain('12 mars 1850');
    expect(element.textContent).toContain('vers 1920');
    expect(element.classList).toContain('sex-M');
  });

  it('shows only the name of a living person', () => {
    const element = render(person({ id: 'I4', givenNames: 'Zoé', sex: 'F', restricted: true }));
    expect(element.textContent).toContain('MARTIN Zoé');
    expect(element.textContent).toContain('Contemporain');
    expect(element.classList).toContain('restricted');
  });

  it('offers to recentre the tree except on the root', () => {
    expect(render(person({ id: 'I1' }), 'root').querySelector('.focus')).toBeNull();
    const element = render(person({ id: 'I2' }), 'parents');
    element.querySelector<HTMLButtonElement>('.focus')!.click();
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ id: 'I2' }));
    element.querySelector<HTMLButtonElement>('.name')!.click();
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 'I2' }));
  });
});
