import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export const ROOT_PERSON_KEY = 'rootPersonId';

/** Application settings stored in the database (key/value). */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<string | undefined> {
    return (await this.prisma.setting.findUnique({ where: { key } }))?.value;
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}
