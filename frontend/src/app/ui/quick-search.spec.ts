import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTestTransloco } from '../../testing/test-helpers';
import { ApiService } from '../core/api.service';
import { QuickSearch } from './quick-search';

const people = [
  {
    id: 'I1',
    givenNames: 'Émile',
    surname: 'MARTIN',
    sex: 'M' as const,
    restricted: false,
    birth: {
      type: 'BIRT',
      date: {
        original: '12 MAR 1850',
        qualifier: 'exact' as const,
        calendar: 'gregorian' as const,
        start: { year: 1850, month: 3, day: 12 },
      },
    },
    death: {
      type: 'DEAT',
      date: {
        original: 'ABT 1920',
        qualifier: 'about' as const,
        calendar: 'gregorian' as const,
        start: { year: 1920 },
      },
    },
  },
  { id: 'I4', givenNames: 'Zoé', surname: 'MARTIN', sex: 'F' as const, restricted: true },
];

describe('QuickSearch', () => {
  const search = vi.fn();

  beforeEach(() => {
    search.mockReset().mockResolvedValue({ items: people, total: 2, page: 1, pageSize: 8 });
    TestBed.configureTestingModule({
      providers: [provideTestTransloco(), provideRouter([]), { provide: ApiService, useValue: { search } }],
    });
  });

  async function typeInto(text: string) {
    const fixture = TestBed.createComponent(QuickSearch);
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    input.dispatchEvent(new Event('focus'));
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 260));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, input, element: fixture.nativeElement as HTMLElement };
  }

  it('only searches from two characters', async () => {
    const { element } = await typeInto('m');
    expect(search).not.toHaveBeenCalled();
    expect(element.querySelector('[role="listbox"]')).toBeNull();
  });

  it('suggests people with their years', async () => {
    const { element, input } = await typeInto('mar');
    expect(search).toHaveBeenCalledWith({ q: 'mar', pageSize: 8 });
    const options = [...element.querySelectorAll('[role="option"]')];
    const text = (option: Element, selector: string) =>
      option.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim();
    expect(options.map((option) => [text(option, '.name'), text(option, '.years')])).toEqual([
      ['MARTIN Émile', '1850 – vers 1920'],
      ['MARTIN Zoé', undefined],
    ]);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('navigates with the keyboard and recentres the tree on the chosen person', async () => {
    const { fixture, input } = await typeInto('mar');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-1$/);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/tree', 'I4']);
    expect(input.value).toBe('');
  });

  it('closes the suggestions with Escape', async () => {
    const { fixture, input, element } = await typeInto('mar');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('[role="listbox"]')).toBeNull();
  });
});
