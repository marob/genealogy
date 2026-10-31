import { Module } from '@nestjs/common';
import { MediaStore } from './media-store.service.js';

@Module({
  providers: [MediaStore],
  exports: [MediaStore],
})
export class MediaModule {}
