import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import type { MediaDto } from '@genealogie/shared';
import { provideTestTransloco } from '../../testing/test-helpers';
import { MediaViewerService } from './media-viewer';

const images: MediaDto[] = [
  { id: 1, fileName: 'portrait.jpg', mimeType: 'image/jpeg', available: true },
  { id: 2, fileName: 'acte.jpg', title: 'Acte de mariage', mimeType: 'image/jpeg', eventType: 'MARR', available: true },
  { id: 3, fileName: 'maison.jpg', mimeType: 'image/jpeg', available: true },
];

describe('MediaViewer', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
  });

  afterEach(() => TestBed.inject(Dialog).closeAll());

  function viewer() {
    return document.querySelector<HTMLElement>('app-media-viewer')!;
  }

  async function settle() {
    TestBed.tick();
    await Promise.resolve();
  }

  function image() {
    return viewer().querySelector('img')!.getAttribute('src');
  }

  function button(label: string) {
    return viewer().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  }

  it('shows the chosen image with its title, event and a link to open it in a new tab', async () => {
    TestBed.inject(MediaViewerService).open(images, 1);
    await settle();
    expect(image()).toBe('/api/media/2');
    expect(viewer().querySelector('h2')!.textContent).toContain('Acte de mariage');
    expect(viewer().querySelector('h2')!.textContent).toContain('Mariage');
    expect(viewer().textContent).toContain('2 / 3');
    const link = viewer().querySelector<HTMLAnchorElement>('a')!;
    expect(link.getAttribute('href')).toBe('/api/media/2');
    expect(link.target).toBe('_blank');
  });

  it('navigates with the buttons, within the bounds of the list', async () => {
    TestBed.inject(MediaViewerService).open(images, 0);
    await settle();
    expect(button('Précédent').disabled).toBe(true);
    button('Suivant').click();
    await settle();
    expect(image()).toBe('/api/media/2');
    button('Suivant').click();
    await settle();
    expect(image()).toBe('/api/media/3');
    expect(button('Suivant').disabled).toBe(true);
    button('Précédent').click();
    await settle();
    expect(image()).toBe('/api/media/2');
  });

  it('navigates with the arrow keys', async () => {
    TestBed.inject(MediaViewerService).open(images, 1);
    await settle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(image()).toBe('/api/media/3');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await settle();
    expect(image()).toBe('/api/media/1');
  });

  it('closes with the close button', async () => {
    TestBed.inject(MediaViewerService).open(images, 0);
    await settle();
    button('Fermer').click();
    await settle();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
  });
});
