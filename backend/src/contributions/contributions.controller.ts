import { createReadStream } from 'node:fs';
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
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  ContributionDto,
  ContributionFieldsDto,
  ContributionStatus,
  NewContributionDto,
} from '@genealogie/shared';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { AdminOnly, Authenticated, CurrentUser } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MediaStore } from '../media/media-store.service.js';
import { ContributionsService } from './contributions.service.js';

const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;
const text = z.string().trim().max(200);
const fieldsSchema = z
  .object({
    givenNames: text,
    surname: text,
    sex: z.enum(['M', 'F', 'U']),
    occupation: text,
    birthDate: text,
    birthPlace: text,
    deathDate: text,
    deathPlace: text,
  })
  .partial()
  .strict();
const unionFieldsSchema = z.object({ marriageDate: text, marriagePlace: text }).partial().strict();
const comment = z.string().trim().max(2000).optional();
const id = z.string().min(1).max(64);
const newContributionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('edit'), personId: id, fields: fieldsSchema, comment }),
  z.object({
    kind: z.literal('add-person'),
    personId: id,
    relation: z.enum(['child', 'parent', 'spouse']),
    familyId: id.optional(),
    fields: fieldsSchema,
    union: unionFieldsSchema.optional(),
    comment,
  }),
  z.object({
    kind: z.literal('add-parents'),
    personId: id,
    father: fieldsSchema.optional(),
    mother: fieldsSchema.optional(),
    union: unionFieldsSchema.optional(),
    comment,
  }),
  z.object({ kind: z.literal('edit-union'), personId: id, familyId: id, fields: unionFieldsSchema, comment }),
]);
const mediaSchema = z.object({
  personId: z.string().min(1).max(64),
  title: z.string().trim().max(200).optional(),
  comment,
});
const statuses = ['pending', 'approved', 'rejected', 'exported', 'integrated'] as const;
const listSchema = z.object({ status: z.enum(statuses).optional() });
const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  fields: z
    .object({ ...fieldsSchema.shape, ...unionFieldsSchema.shape })
    .strict()
    .optional(),
});

/** Changes proposed by members (see shared/contributions.ts). */
@Controller()
export class ContributionsController {
  constructor(
    private readonly contributions: ContributionsService,
    private readonly store: MediaStore,
  ) {}

  @Post('contributions')
  @Authenticated()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(newContributionSchema)) body: NewContributionDto,
  ): Promise<ContributionDto[]> {
    return this.contributions.create(user, body);
  }

  @Post('contributions/media')
  @Authenticated()
  @UseInterceptors(FileInterceptor('file', { dest: tmpdir(), limits: { fileSize: MAX_DOCUMENT_SIZE } }))
  async createMedia(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(mediaSchema)) body: z.infer<typeof mediaSchema>,
  ): Promise<ContributionDto> {
    try {
      if (!file) {
        throw new BadRequestException('No file received ("file" field).');
      }
      return await this.contributions.createMedia(user, {
        ...body,
        path: file.path,
        // multer decodes the file name as latin1.
        fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      });
    } finally {
      if (file) {
        await rm(file.path, { force: true });
      }
    }
  }

  @Get('contributions/mine')
  @Authenticated()
  mine(@CurrentUser() user: AuthUser): Promise<ContributionDto[]> {
    return this.contributions.mine(user);
  }

  @Delete('contributions/:id')
  @Authenticated()
  @HttpCode(204)
  withdraw(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.contributions.withdraw(user, id);
  }

  @Get('admin/contributions')
  @AdminOnly()
  list(@Query(new ZodValidationPipe(listSchema)) query: { status?: ContributionStatus }): Promise<ContributionDto[]> {
    return this.contributions.list(query.status);
  }

  @Patch('admin/contributions/:id')
  @AdminOnly()
  review(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(reviewSchema))
    body: { status: 'approved' | 'rejected'; fields?: ContributionFieldsDto },
  ): Promise<ContributionDto> {
    return this.contributions.review(admin, id, body);
  }

  /** Zip (GEDCOM + documents) of the approved contributions, then marked as exported. */
  @Post('admin/contributions/export')
  @AdminOnly()
  @HttpCode(200)
  async export(@Res() res: Response): Promise<void> {
    const { fileName, content } = await this.contributions.export();
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(content.length),
    });
    res.end(content);
  }

  @Get('admin/contributions/:id/media')
  @AdminOnly()
  async media(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const file = await this.contributions.mediaFile(id);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      'Cache-Control': 'private, max-age=86400',
    });
    createReadStream(this.store.path(file.hash)).pipe(res);
  }
}
