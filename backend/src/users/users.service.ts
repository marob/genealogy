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

  /** Utilisateur fictif du mode développement (AUTH_DEV_BYPASS). */
  devUser(): Promise<User> {
    return this.prisma.user.upsert({
      where: { email: DEV_USER_EMAIL },
      create: { email: DEV_USER_EMAIL, displayName: 'Développeur', role: 'ADMIN', canSeeContemporary: true },
      update: {},
    });
  }

  /**
   * Retrouve ou crée l'utilisateur correspondant à une identité externe.
   * Une identité inconnue est rattachée au compte existant de même e-mail
   * (si l'e-mail est vérifié par le fournisseur), sinon un compte est créé.
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
      throw new BadRequestException('Le fournisseur d’identité n’a pas transmis d’adresse e-mail vérifiée.');
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
      throw new ForbiddenException('Vous ne pouvez pas modifier votre propre rôle.');
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
      throw new ForbiddenException('Vous ne pouvez pas supprimer votre propre compte.');
    }
    await this.getOrThrow(id);
    await this.prisma.user.delete({ where: { id } });
  }

  private async getOrThrow(id: number): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    return user;
  }
}
