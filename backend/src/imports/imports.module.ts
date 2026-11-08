import { Module } from '@nestjs/common';
import { ContributionsModule } from '../contributions/contributions.module.js';
import { MediaModule } from '../media/media.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [SettingsModule, MediaModule, ContributionsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
