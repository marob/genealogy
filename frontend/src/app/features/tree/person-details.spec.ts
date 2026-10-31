import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MediaDto, PersonDto } from '@genealogie/shared';
import { person, provideTestTransloco } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { SessionStore } from '../../core/session.store';
import { MediaViewerService } from '../../ui/media-viewer';
import { PersonDetails } from './person-details';

const photo: MediaDto = { id: 1, fileName: 'portrait.jpg', mimeType: 'image/jpeg', available: true };
const birthRecord: MediaDto = {
  id: 2,
  fileName: 'naissance.jpg',
  title: 'Acte de naissance',
  mimeType: 'image/png',
  eventType: 'BIRT',
  available: true,
};
const census: MediaDto = { id: 3, fileName: 'recensement.pdf', mimeType: 'application/pdf', available: true };
const missing: MediaDto = { id: 4, fileName: 'perdu.jpg', available: false };
const marriage: MediaDto = {
  id: 5,
  fileName: 'mariage.jpg',
  mimeType: 'image/jpeg',
  eventType: 'MARR',
  available: true,
};

describe('PersonDetails', () => {
  const isAdmin = signal(false);
  const open = vi.fn();

  beforeEach(() => {
    isAdmin.set(false);
    open.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        { provide: ApiService, useValue: { people: vi.fn().mockResolvedValue([]) } },
        { provide: SessionStore, useValue: { isAdmin, isAuthenticated: signal(false), user: signal(undefined) } },
        { provide: MediaViewerService, useValue: { open } },
      ],
    });
  });

  async function render(value: PersonDto) {
    const fixture = TestBed.createComponent(PersonDetails);
    fixture.componentRef.setInput('person', value);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const withDocuments = person({
    id: 'I1',
    media: [photo, birthRecord, census, missing],
    unions: [{ familyId: 'F1', childIds: [], events: [], restricted: false, media: [marriage] }],
  });

  it('shows no documents section without documents', async () => {
    const element = await render(person({ id: 'I1' }));
    expect(element.querySelector('app-media-list')).toBeNull();
    expect(element.querySelector('.portrait')).toBeNull();
  });

  it('shows the images as thumbnails and the other files as links', async () => {
    const element = await render(withDocuments);
    const [own] = element.querySelectorAll('app-media-list');
    const thumbnails = [...own!.querySelectorAll<HTMLImageElement>('.thumbnail img')];
    expect(thumbnails.map((img) => img.getAttribute('src'))).toEqual(['/api/media/1', '/api/media/2']);
    expect(thumbnails.map((img) => img.alt)).toEqual(['portrait.jpg', 'Acte de naissance']);
    expect(thumbnails[0]!.getAttribute('loading')).toBe('lazy');
    expect(own!.querySelector('.thumbnails')!.textContent).toContain('Naissance');

    const link = own!.querySelector<HTMLAnchorElement>('.files a')!;
    expect(link.getAttribute('href')).toBe('/api/media/3');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');
    expect(link.textContent).toContain('recensement.pdf');
  });

  it('opens the viewer on the clicked image, among the images of the same list', async () => {
    const element = await render(withDocuments);
    element.querySelectorAll<HTMLButtonElement>('.thumbnail')[1]!.click();
    expect(open).toHaveBeenCalledWith([photo, birthRecord], 1);
  });

  it('shows the documents of a union in its block', async () => {
    const element = await render(withDocuments);
    const lists = element.querySelectorAll('app-media-list');
    expect(lists).toHaveLength(2);
    expect(lists[1]!.querySelector('img')!.getAttribute('src')).toBe('/api/media/5');
    expect(lists[1]!.textContent).toContain('Mariage');
  });

  it('hides the documents not provided from normal users', async () => {
    const element = await render(withDocuments);
    expect(element.querySelector('.missing')).toBeNull();
    expect(element.textContent).not.toContain('perdu.jpg');

    // A person with only missing documents has no documents section at all.
    const onlyMissing = await render(person({ id: 'I2', media: [missing] }));
    expect(onlyMissing.querySelector('app-media-list')).toBeNull();
  });

  it('lists the documents not provided for administrators', async () => {
    isAdmin.set(true);
    const element = await render(withDocuments);
    const details = element.querySelector('.missing')!;
    expect(details.querySelector('summary')!.textContent).toContain('1 document(s) non fourni(s)');
    expect(details.textContent).toContain('perdu.jpg');
  });

  it('shows the first photo not attached to an event as a portrait', async () => {
    const element = await render(withDocuments);
    const portrait = element.querySelector<HTMLButtonElement>('header .portrait')!;
    expect(portrait.querySelector('img')!.getAttribute('src')).toBe('/api/media/1');
    portrait.click();
    expect(open).toHaveBeenCalledWith([photo, birthRecord], 0);
  });

  it('does not use a scanned record as a portrait', async () => {
    const element = await render(person({ id: 'I1', media: [birthRecord] }));
    expect(element.querySelector('header .portrait')).toBeNull();
  });
});
