import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { PersonsModule } from '../persons/persons.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { ContributionsController } from './contributions.controller.js';
import { ContributionsService } from './contributions.service.js';

@Module({
  imports: [MediaModule, PersonsModule, SettingsModule],
  controllers: [ContributionsController],
  providers: [ContributionsService],
  exports: [ContributionsService],
})
export class ContributionsModule {}
