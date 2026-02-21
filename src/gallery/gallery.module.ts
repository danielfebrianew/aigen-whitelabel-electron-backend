import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GalleryService } from './gallery.service';
import { GalleryController } from './gallery.controller';
import { VideoJob } from './entities/video-job.entity';
import { VideoResult } from './entities/video-result.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VideoJob, VideoResult])],
  controllers: [GalleryController],
  providers: [GalleryService],
  exports: [GalleryService], 
})
export class GalleryModule {}