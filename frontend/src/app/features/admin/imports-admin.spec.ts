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
  stats: {
    persons: 7,
    families: 3,
    events: 10,
    places: 3,
    datedPersons: 7,
    ignoredTags: { 'INDI.SOUR': 1 },
    media: { referenced: 221, found: 134 },
  },
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

  function choose(element: HTMLElement, index: number, file: File) {
    const input = element.querySelectorAll<HTMLInputElement>('input[type="file"]')[index]!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  function analyzeButton(element: HTMLElement) {
    return element.querySelector<HTMLButtonElement>('.import-form .btn-primary')!;
  }

  async function uploadFile(media?: File) {
    const fixture = TestBed.createComponent(ImportsAdmin);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    choose(element, 0, new File(['0 HEAD'], 'famille.ged'));
    if (media) {
      choose(element, 1, media);
    }
    await fixture.whenStable();
    analyzeButton(element).click();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('analyzes nothing until a GEDCOM file is chosen', async () => {
    const fixture = TestBed.createComponent(ImportsAdmin);
    await fixture.whenStable();
    expect(analyzeButton(fixture.nativeElement as HTMLElement).disabled).toBe(true);
  });

  it('sends the GEDCOM file and the documents archive', async () => {
    await uploadFile(new File(['PK'], 'documents.zip'));
    expect(api.uploadGedcom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'famille.ged' }),
      expect.objectContaining({ name: 'documents.zip' }),
      expect.any(Function),
    );
  });

  it('sends the GEDCOM file alone when no documents archive is chosen', async () => {
    await uploadFile();
    expect(api.uploadGedcom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'famille.ged' }),
      undefined,
      expect.any(Function),
    );
  });

  it('shows the upload progress', async () => {
    let finish!: (value: ImportDto) => void;
    api.uploadGedcom.mockImplementation((_file: File, _media: File, onProgress: (sent: number) => void) => {
      onProgress(0.5);
      return new Promise((resolve) => (finish = resolve));
    });
    const fixture = await uploadFile();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('progress')?.value).toBe(0.5);
    expect(element.querySelector('.upload-progress')?.textContent).toMatch(/50\s%/);
    expect(analyzeButton(element).disabled).toBe(true);

    finish(preview);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.querySelector('.preview')).not.toBeNull();
    });
    expect(element.querySelector('progress')).toBeNull();
  });

  it('shows the preview of an analyzed file', async () => {
    const element = (await uploadFile()).nativeElement as HTMLElement;
    expect(api.uploadGedcom).toHaveBeenCalled();
    const text = element.querySelector('.preview')!.textContent;
    expect(text).toContain('famille.ged');
    expect(text).toContain('déclaré : ANSEL');
    expect(text).toContain('1 avertissement(s)');
    expect(text).toContain('INDI.SOUR');
    expect(text).toContain('134 / 221 fournis');
  });

  it('applies the import after confirmation', async () => {
    const fixture = await uploadFile();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.preview .btn-danger')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ params: { file: 'famille.ged', persons: 7 } }));
    expect(api.commitImport).toHaveBeenCalledWith(2);
    expect((fixture.nativeElement as HTMLElement).querySelector('.preview')).toBeNull();
  });

  it('applies nothing when the administrator cancels', async () => {
    confirm.mockResolvedValue(false);
    const fixture = await uploadFile();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.preview .btn-danger')!.click();
    await fixture.whenStable();
    expect(api.commitImport).not.toHaveBeenCalled();
  });
});
