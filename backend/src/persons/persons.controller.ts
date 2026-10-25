import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import type { PersonDto, SearchResultDto, SurnameDto, TreeInfoDto } from '@genealogie/shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { AdminOnly, Authenticated, CurrentUser } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PersonsService, type Relatives } from './persons.service.js';

const idSchema = z.string().min(1).max(64);

const listSchema = z.object({
  ids: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(idSchema).max(200)),
});

// eslint-disable-next-line no-useless-assignment -- false positive: used in a parameter decorator
const includeSchema = z.object({
  include: z
    .string()
    .optional()
    .transform((value) => (value ?? '').split(',').filter(Boolean))
    .pipe(z.array(z.enum(['parents', 'children', 'unions']))),
});

const generations = z.coerce.number().int().min(0).max(50).default(50);
const lineageSchema = z.object({ ancestors: generations, descendants: generations });

const optionalText = z.string().trim().max(200).optional();
const optionalYear = z.coerce.number().int().min(-9999).max(9999).optional();
const searchSchema = z.object({
  q: optionalText,
  surname: z.string().max(200).optional(),
  place: optionalText,
  bornFrom: optionalYear,
  bornTo: optionalYear,
  sex: z.enum(['M', 'F', 'U']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

@Controller()
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Get('tree')
  treeInfo(@CurrentUser() user: AuthUser | undefined): Promise<TreeInfoDto> {
    return this.persons.treeInfo(user);
  }

  @Put('admin/tree/root')
  @AdminOnly()
  setRoot(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(z.object({ personId: idSchema }))) body: { personId: string },
  ): Promise<TreeInfoDto> {
    return this.persons.setRoot(user, body.personId);
  }

  @Put('me/root')
  @Authenticated()
  setPersonalRoot(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(z.object({ personId: idSchema.nullable() }))) body: { personId: string | null },
  ): Promise<TreeInfoDto> {
    return this.persons.setPersonalRoot(user, body.personId);
  }

  @Get('persons')
  list(
    @Query(new ZodValidationPipe(listSchema)) query: { ids: string[] },
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<PersonDto[]> {
    return this.persons.findMany(query.ids, user);
  }

  @Get('persons/search')
  search(
    @Query(new ZodValidationPipe(searchSchema)) query: z.infer<typeof searchSchema>,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<SearchResultDto> {
    return this.persons.search(query, user);
  }

  @Get('surnames')
  surnames(@CurrentUser() user: AuthUser | undefined): Promise<SurnameDto[]> {
    return this.persons.surnames(user);
  }

  @Get('persons/:id/lineage')
  lineage(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Query(new ZodValidationPipe(lineageSchema)) query: z.infer<typeof lineageSchema>,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<PersonDto[]> {
    return this.persons.lineage(id, query, user);
  }

  @Get('persons/:id')
  findOne(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Query(new ZodValidationPipe(includeSchema)) query: { include: Relatives[] },
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<PersonDto[]> {
    return this.persons.findWithRelatives(id, query.include, user);
  }
}
