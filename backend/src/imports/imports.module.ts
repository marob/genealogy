import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [SettingsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
