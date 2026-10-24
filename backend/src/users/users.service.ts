import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Role, UserDto } from '@genealogie/shared';
import type { AuthUser } from '../auth/auth-user.js';
import type { ExternalIdentity } from '../auth/auth-providers.service.js';
import type { Env } from '../config/env.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DEV_USER_EMAIL = 'dev@localhost';

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role as Role,
    canSeeContemporary: user.canSeeContemporary,
    createdAt: user.createdAt.toISOString(),
    ...(user.displayName ? { displayName: user.displayName } : {}),
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt.toISOString() } : {}),
    ...(user.rootPersonId ? { rootPersonId: user.rootPersonId } : {}),
  };
}

export function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email, role: user.role as Role, canSeeContemporary: user.canSeeContemporary };
}

@Injectable()
export class UsersService {
  private readonly adminEmails: string[];

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.adminEmails = config.get('ADMIN_EMAILS', { infer: true });
  }

  findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Fake user for development mode (AUTH_DEV_BYPASS). */
  devUser(): Promise<User> {
    return this.prisma.user.upsert({
      where: { email: DEV_USER_EMAIL },
      create: { email: DEV_USER_EMAIL, displayName: 'Developer', role: 'ADMIN', canSeeContemporary: true },
      update: {},
    });
  }

  /**
   * Finds or creates the user matching an external identity.
   * An unknown identity is linked to the existing account with the same email
   * (if the email is verified by the provider), otherwise an account is created.
   */
  async loginWithIdentity(identity: ExternalIdentity): Promise<User> {
    const now = new Date();
    const profile = {
      lastLoginAt: now,
      ...(identity.name ? { displayName: identity.name } : {}),
      ...(identity.picture ? { avatarUrl: identity.picture } : {}),
    };

    const existing = await this.prisma.identity.findUnique({
      where: { provider_subject: { provider: identity.provider, subject: identity.subject } },
      include: { user: true },
    });
    if (existing) {
      return this.prisma.user.update({ where: { id: existing.userId }, data: profile });
    }

    if (!identity.email || !identity.emailVerified) {
      throw new BadRequestException('The identity provider did not provide a verified email address.');
    }
    const email = identity.email.toLowerCase();
    const isAdmin = this.adminEmails.includes(email);
    return this.prisma.user.upsert({
      where: { email },
      create: {
        email,
        role: isAdmin ? 'ADMIN' : 'MEMBER',
        ...profile,
        identities: { create: { provider: identity.provider, subject: identity.subject } },
      },
      update: {
        ...profile,
        ...(isAdmin ? { role: 'ADMIN' } : {}),
        identities: { create: { provider: identity.provider, subject: identity.subject } },
      },
    });
  }

  async list(): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({ orderBy: [{ role: 'asc' }, { email: 'asc' }] });
    return users.map(toUserDto);
  }

  async update(
    currentUser: AuthUser,
    id: number,
    changes: { role?: Role | undefined; canSeeContemporary?: boolean | undefined },
  ): Promise<UserDto> {
    if (id === currentUser.id && changes.role && changes.role !== currentUser.role) {
      throw new ForbiddenException('You cannot change your own role.');
    }
    await this.getOrThrow(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(changes.role ? { role: changes.role } : {}),
        ...(changes.canSeeContemporary === undefined ? {} : { canSeeContemporary: changes.canSeeContemporary }),
      },
    });
    return toUserDto(user);
  }

  async delete(currentUser: AuthUser, id: number): Promise<void> {
    if (id === currentUser.id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }
    await this.getOrThrow(id);
    await this.prisma.user.delete({ where: { id } });
  }

  /** Deletes the current user's account and identities (self-service, required by the identity providers). */
  async deleteOwnAccount(currentUser: AuthUser): Promise<void> {
    if (currentUser.role === 'ADMIN' && (await this.prisma.user.count({ where: { role: 'ADMIN' } })) <= 1) {
      throw new ForbiddenException('The last administrator cannot delete their account.');
    }
    await this.prisma.user.delete({ where: { id: currentUser.id } });
  }

  private async getOrThrow(id: number): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }
}
