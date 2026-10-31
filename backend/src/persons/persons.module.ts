import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { MediaController } from './media.controller.js';
import { PersonsController } from './persons.controller.js';
import { PersonsService } from './persons.service.js';

@Module({
  imports: [SettingsModule, MediaModule],
  controllers: [PersonsController, MediaController],
  providers: [PersonsService],
})
export class PersonsModule {}
