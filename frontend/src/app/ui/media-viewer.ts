import { Component, computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { type MediaDto, mediaUrl } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { iconClose, iconExternal, iconNext, iconPrevious } from './icons';

const TITLE_ID = 'media-viewer-title';

interface MediaViewerData {
  /** Images that can be browsed with previous / next. */
  images: MediaDto[];
  /** Index of the image shown first. */
  index: number;
}

/** Full-size image viewer, with navigation among the images of a list. */
@Component({
  selector: 'app-media-viewer',
  imports: [FaIconComponent, TranslocoPipe],
  template: `
    @let image = current();
    <header class="viewer-header">
      <h2 class="dialog-title" [id]="titleId">
        {{ image.title || image.fileName }}
        @if (image.eventType) {
          <span class="muted">— {{ 'events.' + image.eventType | transloco }}</span>
        }
      </h2>
      <button type="button" class="btn-icon" [attr.aria-label]="'common.close' | transloco" (click)="ref.close()">
        <fa-icon [icon]="icons.iconClose" />
      </button>
    </header>
    <img class="viewer-image" [src]="url(image)" [alt]="image.title || image.fileName" />
    <footer class="viewer-footer">
      @if (data.images.length > 1) {
        <button
          type="button"
          class="btn-icon"
          [disabled]="index() === 0"
          [attr.aria-label]="'common.previous' | transloco"
          (click)="move(-1)"
        >
          <fa-icon [icon]="icons.iconPrevious" />
        </button>
        <output class="muted">{{ index() + 1 }} / {{ data.images.length }}</output>
        <button
          type="button"
          class="btn-icon"
          [disabled]="index() === data.images.length - 1"
          [attr.aria-label]="'common.next' | transloco"
          (click)="move(1)"
        >
          <fa-icon [icon]="icons.iconNext" />
        </button>
      }
      <a class="open-link" [href]="url(image)" target="_blank" rel="noopener">
        <fa-icon [icon]="icons.iconExternal" /> {{ 'media.openInNewTab' | transloco }}
      </a>
    </footer>
  `,
  styles: `
    // Overrides the fixed width of the generic dialogs.
    :host(.dialog) {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: auto;
      max-width: calc(100vw - 2rem);
    }

    .viewer-header,
    .viewer-footer {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .viewer-header {
      justify-content: space-between;

      .dialog-title {
        margin: 0;
      }
    }

    .viewer-image {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 10rem);
      margin: 0 auto;
      object-fit: contain;
    }

    .open-link {
      margin-left: auto;
    }
  `,
  host: { class: 'dialog' },
})
class MediaViewer {
  protected readonly data = inject<MediaViewerData>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  protected readonly index = signal(this.data.index);
  protected readonly current = computed(() => this.data.images[this.index()]!);

  constructor() {
    // Keyboard navigation: events of the dialog's overlay only.
    this.ref.keydownEvents.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.move(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
  }

  protected move(step: number): void {
    this.index.update((index) => Math.min(Math.max(index + step, 0), this.data.images.length - 1));
  }

  protected readonly titleId = TITLE_ID;
  protected readonly url = mediaUrl;
  protected readonly icons = { iconClose, iconExternal, iconNext, iconPrevious };
}

@Injectable({ providedIn: 'root' })
export class MediaViewerService {
  private readonly dialog = inject(Dialog);

  open(images: MediaDto[], index: number): void {
    this.dialog.open(MediaViewer, {
      data: { images, index } satisfies MediaViewerData,
      ariaModal: true,
      ariaLabelledBy: TITLE_ID,
    });
  }
}
