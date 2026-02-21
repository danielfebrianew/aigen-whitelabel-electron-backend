import {
  Body,
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  InternalServerErrorException,
  Sse,
  MessageEvent,
  Param,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { GenerateAiService } from './generate-video.service';
import { GenerateTextDto, GenerateVideoDto } from './dto/generate-video.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { SkipThrottle, Throttle } from '@nestjs/throttler';


@Controller('generate')
@UseInterceptors(ResponseInterceptor)
export class GenerateAiController {
  constructor(
    private readonly generateAiService: GenerateAiService,
    private eventEmitter: EventEmitter2
  ) { }

  @SkipThrottle()
  @Sse('progress/:jobId')
  sse(@Param('jobId') jobId: string): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'job.progress').pipe(
      filter((payload: any) => payload.jobId === jobId),
      map((payload: any) => {
        return {
          data: {
            message: payload.message,
            progress: payload.progress ?? null
          },
        } as MessageEvent;
      }),
    );
  }

  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  @Post('text')
  @ResponseMessage('Generate Text Berhasil')
  async generateText(@Body() dto: GenerateTextDto) {
    const result = await this.generateAiService.generateText(dto.imageUrl, dto.promptCount, dto.productName);
    return result;
  }

  @Throttle({ heavy: { limit: 2, ttl: 60000 } })
  @Post('video')
  @ResponseMessage('Video sedang diproses')
  async generateVideo(@Body() dto: GenerateVideoDto) {
    const count = dto.prompts.length;

    if (count < 4 || count > 6) {
      throw new BadRequestException(`Jumlah prompt harus antara 4-6. Kamu kirim ${count}.`);
    }

    if (dto.targetCount < 1 || dto.targetCount > 100) {
      throw new BadRequestException(`Jumlah variasi video harus antara 1-100. Kamu minta: ${dto.targetCount}`);
    }

    const result = await this.generateAiService.processVideoVariations(
      dto.images,
      dto.productName,
      dto.prompts,
      dto.script,
      dto.jobId,
      dto.targetCount,
      dto.voiceGender || 'female',
    );

    return result;
  }

  @Throttle({ upload: { limit: 15, ttl: 60000 } })
  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 6))
  @ResponseMessage('Upload File Berhasil')
  async uploadFiles(@UploadedFiles() files: Array<Express.Multer.File>) {
    if (!files || files.length === 0) throw new BadRequestException('File tidak ditemukan');

    for (const file of files) {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
        throw new BadRequestException('Hanya boleh upload file gambar (jpg, png, webp)');
      }
    }

    try {
      const result = await this.generateAiService.uploadImages(files);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload Failed';
      throw new InternalServerErrorException(msg);
    }
  }
}