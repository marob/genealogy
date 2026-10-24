import { TestBed } from '@angular/core/testing';
import type { ImportDto } from '@genealogie/shared';
import { provideTestTransloco } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { ConfirmService } from '../../ui/confirm-dialog';
import { ImportsAdmin } from './imports-admin';

const preview: ImportDto = {
  id: 2,
  status: 'preview',
  fileName: 'famille.ged',
  encoding: 'UTF-8',
  declaredCharset: 'ANSEL',
  createdAt: '2026-10-24T10:00:00Z',
  stats: { persons: 7, families: 3, events: 10, places: 3, datedPersons: 7, ignoredTags: { 'INDI.SOUR': 1 } },
  warnings: ['Date non reconnue'],
  current: false,
};

describe('ImportsAdmin', () => {
  const api = {
    imports: vi.fn(),
    uploadGedcom: vi.fn(),
    commitImport: vi.fn(),
    deleteImport: vi.fn(),
  };
  const confirm = vi.fn();

  beforeEach(() => {
    api.imports.mockReset().mockResolvedValue([]);
    api.uploadGedcom.mockReset().mockResolvedValue(preview);
    api.commitImport.mockReset().mockResolvedValue({ ...preview, status: 'committed', current: true });
    confirm.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        { provide: ApiService, useValue: api },
        { provide: ConfirmService, useValue: { confirm } },
      ],
    });
  });

  async function uploadFile() {
    const fixture = TestBed.createComponent(ImportsAdmin);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['0 HEAD'], 'famille.ged')] });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('affiche l’aperçu d’un fichier analysé', async () => {
    const element = (await uploadFile()).nativeElement as HTMLElement;
    expect(api.uploadGedcom).toHaveBeenCalled();
    const text = element.querySelector('.preview')!.textContent;
    expect(text).toContain('famille.ged');
    expect(text).toContain('déclaré : ANSEL');
    expect(text).toContain('1 avertissement(s)');
    expect(text).toContain('INDI.SOUR');
  });

  it('applique l’import après confirmation', async () => {
    const fixture = await uploadFile();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.preview .btn-danger')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ params: { file: 'famille.ged', persons: 7 } }));
    expect(api.commitImport).toHaveBeenCalledWith(2);
    expect((fixture.nativeElement as HTMLElement).querySelector('.preview')).toBeNull();
  });

  it('n’applique rien si l’administrateur annule', async () => {
    confirm.mockResolvedValue(false);
    const fixture = await uploadFile();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.preview .btn-danger')!.click();
    await fixture.whenStable();
    expect(api.commitImport).not.toHaveBeenCalled();
  });
});
