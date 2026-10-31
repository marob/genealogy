import { Component, computed, inject, input } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { type MediaDto, mediaThumbnailUrl, mediaUrl } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { SessionStore } from '../../core/session.store';
import { iconFile, iconPdf } from '../../ui/icons';
import { MediaViewerService } from '../../ui/media-viewer';

export function isImage(media: MediaDto): boolean {
  return media.available && !!media.mimeType?.startsWith('image/');
}

/**
 * Portrait of a person: first available image not attached to an event
 * (images of events are usually scanned records).
 */
export function portraitOf(media: readonly MediaDto[]): MediaDto | undefined {
  return media.find((item) => isImage(item) && !item.eventType);
}

/** Whether a list of documents has something to show to the current user. */
export function hasVisibleMedia(media: readonly MediaDto[], isAdmin: boolean): boolean {
  return isAdmin ? media.length > 0 : media.some((item) => item.available);
}

/**
 * Documents of a person or a union: thumbnails for the images (opened in a
 * viewer), links for the other files, and, for administrators only, the
 * documents referenced by the GEDCOM file but not provided with the import.
 */
@Component({
  selector: 'app-media-list',
  imports: [FaIconComponent, TranslocoPipe],
  templateUrl: './media-list.html',
  styleUrl: './media-list.scss',
})
export class MediaList {
  readonly media = input.required<MediaDto[]>();

  private readonly viewer = inject(MediaViewerService);
  protected readonly session = inject(SessionStore);

  protected readonly images = computed(() => this.media().filter(isImage));
  protected readonly files = computed(() => this.media().filter((item) => item.available && !isImage(item)));
  protected readonly missing = computed(() => this.media().filter((item) => !item.available));

  protected open(index: number): void {
    this.viewer.open(this.images(), index);
  }

  protected fileIcon(media: MediaDto) {
    return media.mimeType === 'application/pdf' ? iconPdf : iconFile;
  }

  protected readonly url = mediaUrl;
  protected readonly thumbnailUrl = mediaThumbnailUrl;
}
