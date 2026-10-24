import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch } from '@nestjs/common';
import type { UserDto } from '@genealogie/shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

const updateUserSchema = z
  .object({
    role: z.enum(['ADMIN', 'MEMBER']).optional(),
    canSeeContemporary: z.boolean().optional(),
  })
  .strict();

@Controller('admin/users')
@AdminOnly()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserDto[]> {
    return this.users.list();
  }

  @Patch(':id')
  update(
    @CurrentUser() currentUser: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateUserSchema)) body: z.infer<typeof updateUserSchema>,
  ): Promise<UserDto> {
    return this.users.update(currentUser, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@CurrentUser() currentUser: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.users.delete(currentUser, id);
  }
}
