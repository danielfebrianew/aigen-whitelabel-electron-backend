import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VideoMixerService } from './video-mixer.service';
import { VideoMixerController } from './video-mixer.controller';
import { VideoUtilsHelper } from './helpers/video-utils.helper';
import { AwsStorageService } from '../generate-video/services/aws-storage.service';
import { GalleryModule } from '../gallery/gallery.module';

@Module({
  imports: [ConfigModule, GalleryModule],
  controllers: [VideoMixerController],
  providers: [VideoMixerService, VideoUtilsHelper, AwsStorageService],
})
export class VideoMixerModule {}
