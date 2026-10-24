import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestTransloco } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { PrintPage } from './print-page';

describe('PrintPage', () => {
  it('shows a message for a person that cannot be found', async () => {
    const api: Partial<ApiService> = {
      lineage: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 404 })),
      search: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [provideTestTransloco(), provideRouter([]), { provide: ApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(PrintPage);
    fixture.componentRef.setInput('person', 'I999');
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent.trim()).toBe('Cette personne est introuvable.');
    expect(element.querySelector<HTMLInputElement>('input[name="up"]')?.max).toBe('0');
  });
});
