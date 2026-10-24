import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTestTransloco } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { SearchPage } from './search-page';

describe('SearchPage', () => {
  const search = vi.fn();
  const surnames = vi.fn();

  beforeEach(() => {
    search.mockReset().mockResolvedValue({
      items: [
        { id: 'I1', givenNames: 'Émile', surname: 'MARTIN', sex: 'M', restricted: false },
        { id: 'I4', givenNames: 'Zoé', surname: 'MARTIN', sex: 'F', restricted: true },
      ],
      total: 2,
      page: 1,
      pageSize: 50,
    });
    surnames.mockReset().mockResolvedValue([
      { surname: 'BERNARD', count: 1 },
      { surname: 'ÉTIENNE', count: 2 },
    ]);
    TestBed.configureTestingModule({
      providers: [provideTestTransloco(), provideRouter([]), { provide: ApiService, useValue: { search, surnames } }],
    });
  });

  async function render(inputs: Record<string, string> = {}) {
    const fixture = TestBed.createComponent(SearchPage);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the surname index without criteria', async () => {
    const element = (await render()).nativeElement as HTMLElement;
    expect(search).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Index des patronymes');
    // "ÉTIENNE" is listed under E.
    expect([...element.querySelectorAll('.initial')].map((h) => h.textContent)).toEqual(['B', 'E']);
  });

  it('searches using the URL criteria', async () => {
    const fixture = await render({ q: 'martin', bornFrom: '1850', page: '1' });
    expect(search).toHaveBeenCalledWith({ q: 'martin', bornFrom: 1850, page: 1, pageSize: 50 });
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('2 résultat(s)');
    expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(element.querySelector('.badge')?.textContent).toContain('Contemporain');
    expect(element.querySelector<HTMLInputElement>('input[formcontrolname="q"]')!.value).toBe('martin');
  });

  it('puts the entered criteria in the URL', async () => {
    const fixture = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('input[formcontrolname="place"]')!;
    input.value = 'Lyon';
    input.dispatchEvent(new Event('input'));
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(navigate).toHaveBeenCalledWith(['/search'], { queryParams: { place: 'Lyon' } });
  });
});
