import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { ImportDto } from '@genealogie/shared';
import type { AuthUser } from '../auth/auth-user.js';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators.js';
import { ImportsService, MAX_GEDCOM_SIZE } from './imports.service.js';

function isZipName(name: string): boolean {
  return /\.zip$/i.test(name);
}

/** Zip archives of documents can be large (photos, scanned records). */
const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024;

type UploadedFields = Partial<Record<'file' | 'media', Express.Multer.File[]>>;

@Controller('admin/imports')
@AdminOnly()
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list(): Promise<ImportDto[]> {
    return this.imports.list();
  }

  /**
   * `file`: GEDCOM file, or zip archive containing the GEDCOM and its documents;
   * `media` (optional): zip archive of the documents. Uploads go to temporary
   * files, deleted once processed.
   */
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'media', maxCount: 1 },
      ],
      { dest: tmpdir(), limits: { fileSize: MAX_FILE_SIZE } },
    ),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: UploadedFields | undefined,
    @Body() body: { importNotes?: string } | undefined,
  ): Promise<ImportDto> {
    const [file] = files?.file ?? [];
    const [media] = files?.media ?? [];
    try {
      if (!file) {
        throw new BadRequestException('No file received ("file" field).');
      }
      if (!isZipName(file.originalname) && file.size > MAX_GEDCOM_SIZE) {
        throw new BadRequestException('The GEDCOM file is too large.');
      }
      return await this.imports.preview(user, {
        path: file.path,
        // multer decodes the file name as latin1.
        fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        ...(media ? { mediaPath: media.path } : {}),
        // Multipart text field: "false" leaves the notes out.
        importNotes: body?.importNotes !== 'false',
      });
    } finally {
      const uploads = [file, media].filter((upload) => upload !== undefined);
      await Promise.all(uploads.map((upload) => rm(upload.path, { force: true })));
    }
  }

  @Post(':id/commit')
  commit(@Param('id', ParseIntPipe) id: number): Promise<ImportDto> {
    return this.imports.commit(id);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.imports.delete(id);
  }
}
