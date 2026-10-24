import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ImportDto } from '@genealogie/shared';
import type { AuthUser } from '../auth/auth-user.js';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators.js';
import { ImportsService } from './imports.service.js';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

@Controller('admin/imports')
@AdminOnly()
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list(): Promise<ImportDto[]> {
    return this.imports.list();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined): Promise<ImportDto> {
    if (!file) {
      throw new BadRequestException('No file received ("file" field).');
    }
    // multer decodes the file name as latin1.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.imports.preview(user, fileName, file.buffer);
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
