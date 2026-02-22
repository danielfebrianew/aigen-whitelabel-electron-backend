import { Module } from '@nestjs/common';
import { GenerateImageService } from './generate-image.service';
import { GenerateImageController } from './generate-image.controller';
import { GeminiImageGenService } from './services/kie-image-gen.service';
import { OpenAiPromptService } from './services/gemini-prompt.service';
import { ConfigModule } from '@nestjs/config';
import { AwsStorageService } from './services/aws-storage.service';

@Module({
  imports: [ConfigModule],
  controllers: [GenerateImageController],
  providers: [
    GenerateImageService,
    GeminiImageGenService,
    OpenAiPromptService,
    AwsStorageService,
  ],
})
export class GenerateImageModule {}