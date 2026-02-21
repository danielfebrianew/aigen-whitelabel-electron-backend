import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GenerateAiController } from './generate-video.controller';
import { GenerateAiService } from './generate-video.service';
import { VideoUtilsHelper } from './helpers/video-utils.helper';
import { AwsStorageService } from './services/aws-storage.service';
import { OpenAiScriptService } from './services/openai-script.service';
import { WavespeedVideoService } from './services/wavespeed-video.service';
import { GeminiTtsService } from './services/gemini-tts.service';
import { FfmpegMixService } from './services/ffmpeg-mixer.service';
import { GalleryModule } from 'src/gallery/gallery.module';

@Module({
  imports: [ConfigModule, GalleryModule],
  controllers: [GenerateAiController],
  providers: [
    GenerateAiService,     
    VideoUtilsHelper,      
    AwsStorageService,
    OpenAiScriptService,
    WavespeedVideoService,
    GeminiTtsService,
    FfmpegMixService,
  ],
})
export class GenerateAiModule {}