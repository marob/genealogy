import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/auth.decorators.js';
import { MediaStore } from '../media/media-store.service.js';
import { PersonsService } from './persons.service.js';

/** Types displayed in the browser; anything else is downloaded. */
const INLINE_TYPES = /^(image\/(jpeg|png|gif|bmp|webp)|application\/pdf)$/;

@Controller('media')
export class MediaController {
  constructor(
    private readonly persons: PersonsService,
    private readonly store: MediaStore,
  ) {}

  /** Content of a document (privacy rule applied). */
  @Get(':id')
  async content(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.persons.mediaFile(id, user);
    this.send(res, {
      path: this.store.path(file.hash),
      etag: file.hash,
      mimeType: file.mimeType,
      size: file.size,
      fileName: file.fileName,
    });
  }

  /** Small version of an image (the original for other files or unsupported formats). */
  @Get(':id/thumbnail')
  async thumbnail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.persons.mediaFile(id, user);
    const thumbnail = await this.store.thumbnail(file.hash, file.mimeType);
    if (!thumbnail) {
      return this.content(id, user, res);
    }
    this.send(res, {
      path: thumbnail,
      etag: `${file.hash}-thumbnail`,
      mimeType: 'image/webp',
      size: (await stat(thumbnail)).size,
      fileName: file.fileName.replace(/\.[^.]*$/, '.webp'),
    });
  }

  private send(
    res: Response,
    file: { path: string; etag: string; mimeType: string; size: number; fileName: string },
  ): void {
    const disposition = INLINE_TYPES.test(file.mimeType) ? 'inline' : 'attachment';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      // Content-addressed: never changes, but private (privacy rule per user).
      'Cache-Control': 'private, max-age=86400',
      ETag: `"${file.etag}"`,
    });
    if (res.req.headers['if-none-match'] === `"${file.etag}"`) {
      res.status(304).end();
      return;
    }
    createReadStream(file.path).pipe(res);
  }
}
