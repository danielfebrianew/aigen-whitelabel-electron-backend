import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GalleryModule } from 'src/gallery/gallery.module';
import { GenerateProController } from './generate-pro.controller';
import { GenerateProService } from './generate-pro.service';
import { AwsStorageService } from './services/aws-storage.service';
import { KieVideoService } from './services/kie-video.service';
import { GeminiVideoPromptService } from './services/gemini-prompt.service';

@Module({
  imports: [ConfigModule, GalleryModule],
  controllers: [GenerateProController],
  providers: [GenerateProService, KieVideoService, GeminiVideoPromptService, AwsStorageService],
})
export class GenerateProModule {}
