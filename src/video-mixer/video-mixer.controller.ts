import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { VideoMixerService } from './video-mixer.service';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

@Controller('')
@UseInterceptors(ResponseInterceptor)
export class VideoMixerController {
  constructor(private readonly videoService: VideoMixerService) {}

  @Post('video-mixer')
  @ResponseMessage('Video sedang diproses')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'clips', maxCount: 6 },
        { name: 'audio', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: './uploads',
          filename: (req, file, cb) => {
            const randomName = Array(32).fill(null).map(() => (Math.round(Math.random() * 16)).toString(16)).join('');
            cb(null, `${randomName}${extname(file.originalname)}`);
          },
        }),
      },
    ),
  )
  async stitchVideo(
    @UploadedFiles() files: { clips?: Express.Multer.File[], audio?: Express.Multer.File[], thumbnail?: Express.Multer.File[] },
    @Body('variations') variations: string,
    @Body('jobId') jobId: string,
    @Body('productName') productName: string,
    @Body('script') script: string,
    @Body('voiceGender') voiceGender: string,
  ) {
    if (!files.clips || files.clips.length < 2) {
      throw new BadRequestException('Minimal upload 2 video klip.');
    }
    if (!files.audio || files.audio.length === 0) {
      throw new BadRequestException('File audio diperlukan.');
    }
    if (!jobId) {
      throw new BadRequestException('jobId diperlukan');
    }

    const clipPaths = files.clips.map(file => file.path);
    const audioPath = files.audio[0].path;
    const thumbnailPath = files.thumbnail?.[0]?.path;
    const targetVar = parseInt(variations) || 1;

    const result = await this.videoService.generateStitchedVideos(
      clipPaths,
      audioPath,
      targetVar,
      jobId,
      productName || 'Mixed Video',
      script || '',
      voiceGender || 'female',
      thumbnailPath,
    );

    return result;
  }
}