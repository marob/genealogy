import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { PersonsController } from './persons.controller.js';
import { PersonsService } from './persons.service.js';

@Module({
  imports: [SettingsModule],
  controllers: [PersonsController],
  providers: [PersonsService],
})
export class PersonsModule {}
