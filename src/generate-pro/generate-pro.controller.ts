import {
  BadRequestException,
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Observable, fromEvent } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { CreateGenerateProDto } from './dto/create-generate-pro.dto';
import { GenerateProService, KieCallbackPayload } from './generate-pro.service';
import { GalleryService } from 'src/gallery/gallery.service';

@Controller('generate-pro')
@UseInterceptors(ResponseInterceptor)
export class GenerateProController {
  constructor(
    private readonly generateProService: GenerateProService,
    private readonly galleryService: GalleryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @SkipThrottle()
  @Sse('progress/:jobId')
  sse(@Param('jobId') jobId: string): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'pro.job.progress').pipe(
      filter((payload: any) => payload.jobId === jobId),
      map((payload: any) => ({
        data: {
          message: payload.message,
          progress: payload.progress ?? null,
          status: payload.progress === 100 ? 'success'
            : payload.progress === -1 ? 'failed'
            : 'processing',
          resultUrls: payload.resultUrls ?? null,
          failMsg: payload.failMsg ?? null,
        },
      })) as any,
    );
  }

  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @Post('create')
  @UseInterceptors(FileInterceptor('image'))
  @ResponseMessage('Task submitted to Kie.ai')
  async createTask(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateGenerateProDto,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
      throw new BadRequestException('Hanya boleh upload gambar (jpg, jpeg, png, webp)');
    }
    return this.generateProService.submitTask(dto, file);
  }

  @Post('callback')
  async handleCallback(@Body() payload: KieCallbackPayload) {
    await this.generateProService.handleCallback(payload);
    return { received: true };
  }

  @Post('progress-callback')
  async handleProgressCallback(@Body() payload: any) {
    await this.generateProService.handleProgressCallback(payload);
    return { received: true };
  }

  @Get('active-job')
  @ResponseMessage('Active job retrieved')
  async getActiveJob() {
    const job = await this.galleryService.findActiveJob();
    if (!job) return null;

    try {
      const kieData = await this.generateProService.queryTaskStatus(job.jobId);
      if (kieData.state === 'success' || kieData.state === 'fail') {
        return null;
      }
    } catch {
      // Kie.ai query failed (e.g. task not found / 422) — treat as stale, mark failed so it stops appearing
      await this.generateProService.syncJobStatus(job.jobId, 'fail', [], 'Task not found in Kie.ai');
      return null;
    }

    return {
      jobId: job.jobId,
      productName: job.productName,
      thumbnailUrl: job.thumbnailUrl,
      status: job.status,
      createdAt: job.createdAt,
    };
  }

  @Get('status/:taskId')
  @ResponseMessage('Task status retrieved')
  async getTaskStatus(@Param('taskId') taskId: string) {
    return this.generateProService.queryTaskStatus(taskId);
  }
}
