import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GalleryService } from 'src/gallery/gallery.service';
import { VideoJobStatus } from 'src/gallery/entities/video-job.entity';
import { CreateGenerateProDto } from './dto/create-generate-pro.dto';
import { AwsStorageService } from './services/aws-storage.service';
import { KieVideoService } from './services/kie-video.service';
import { GeminiVideoPromptService } from './services/gemini-prompt.service';

export class KieCallbackData {
  taskId: string;
  state: 'success' | 'fail';
  resultJson: string | null;
  failCode: string | null;
  failMsg: string | null;
  model: string;
  completeTime: number;
  costTime: number;
  createTime: number;
  param: string;
}

export class KieCallbackPayload {
  code: number;
  data: KieCallbackData;
  msg: string;
}

@Injectable()
export class GenerateProService {
  private readonly logger = new Logger(GenerateProService.name);

  constructor(
    private readonly kieVideoService: KieVideoService,
    private readonly geminiVideoPromptService: GeminiVideoPromptService,
    private readonly awsStorageService: AwsStorageService,
    private readonly galleryService: GalleryService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async submitTask(dto: CreateGenerateProDto, file: Express.Multer.File) {
    const reqId = dto.jobId;
    const appBaseUrl = this.configService.get<string>('APP_BASE_URL');
    const callBackUrl = `${appBaseUrl}/generate-pro/callback`;
    const progressCallBackUrl = `${appBaseUrl}/generate-pro/progress-callback`;

    // Step 1: Upload image ke S3
    this.logProgress(reqId, 'Uploading product image...', 5);
    const ext = file.mimetype.split('/')[1];
    const imageUrl = await this.awsStorageService.uploadFile(
      file.buffer,
      `${reqId}-${Date.now()}.${ext}`,
      file.mimetype,
      'generate-pro',
    );

    // Step 2: Generate structured Sora prompt via Gemini
    this.logProgress(reqId, 'Generating video prompt...', 15);
    const videoPrompt = await this.geminiVideoPromptService.generateVideoPrompt(
      imageUrl,
      dto.productTitle,
      dto.productDescription,
    );

    // Step 3: Submit ke Kie.ai (aspect_ratio dan n_frames di-lock)
    this.logProgress(reqId, 'Submitting task to Kie.ai...', 30);
    const taskId = await this.kieVideoService.createTask(
      videoPrompt,
      imageUrl,
      'portrait',
      '15',
      callBackUrl,
      progressCallBackUrl,
      reqId,
    );

    // Step 4: Simpan job metadata ke gallery (pakai taskId sebagai jobId)
    this.logProgress(reqId, 'Saving job metadata...', 35);
    await this.galleryService.createJobMetadata(
      taskId,
      dto.productTitle,
      videoPrompt,
      'female',
      1,
      1,
      [videoPrompt],
      [imageUrl],
      imageUrl,
      true,
    );

    // Update status ke processing (taskId = jobId di database)
    await this.galleryService.updateJobStatus(taskId, VideoJobStatus.PROCESSING);

    this.logProgress(reqId, 'Task submitted to Kie.ai', 40);
    return { jobId: reqId, taskId, imageUrl, generatedPrompt: videoPrompt };
  }

  async handleCallback(payload: KieCallbackPayload) {
    const { data } = payload;
    const jobId = data.taskId;

    if (data.state === 'success') {
      let resultUrls: string[] = [];
      try {
        resultUrls = JSON.parse(data.resultJson ?? '{}').resultUrls ?? [];
      } catch {
        this.logger.error(`[${jobId}] Failed to parse resultJson`);
      }

      for (let i = 0; i < resultUrls.length; i++) {
        try {
          await this.galleryService.upsertVideoToJob(
            jobId,
            i + 1,
            resultUrls[i],
            `pro-video-${i + 1}.mp4`,
          );
        } catch (err) {
          this.logger.error(`[${jobId}] Failed to save video ${i + 1}: ${err.message}`);
        }
      }

      await this.galleryService.updateJobStatus(jobId, VideoJobStatus.SUCCESS);
      this.logger.log(`[${jobId}] Video generated successfully`);
      this.eventEmitter.emit('pro.job.progress', {
        jobId,
        message: 'success',
        progress: 100,
        resultUrls,
      });
    } else {
      await this.galleryService.updateJobStatus(jobId, VideoJobStatus.FAILED, data.failMsg ?? undefined);
      this.logger.error(`[${jobId}] Task failed: ${data.failMsg}`);
      this.eventEmitter.emit('pro.job.progress', {
        jobId,
        message: 'failed',
        progress: -1,
        failMsg: data.failMsg,
      });
    }
  }

  async handleProgressCallback(payload: any) {
    const taskId = payload?.data?.taskId ?? payload?.taskId;
    const progress = payload?.data?.progress ?? payload?.progress;

    if (!taskId) {
      this.logger.warn(`Progress callback missing taskId: ${JSON.stringify(payload)}`);
      return;
    }

    // Map progress dari Kie.ai (0-100) ke range 40-99 (karena 0-40 sudah terpakai saat submit)
    const mappedProgress = Math.min(40 + Math.round((progress ?? 50) * 0.59), 99);

    this.logger.log(`[${taskId}] Progress callback: ${progress}% → ${mappedProgress}%`);
    this.eventEmitter.emit('pro.job.progress', {
      jobId: taskId,
      message: 'Processing video...',
      progress: mappedProgress,
    });
  }

  async queryTaskStatus(taskId: string) {
    const data = await this.kieVideoService.queryTask(taskId);

    let resultUrls: string[] = [];
    if (data.state === 'success' && data.resultJson) {
      try {
        resultUrls = JSON.parse(data.resultJson).resultUrls ?? [];
      } catch {
        this.logger.error(`[${taskId}] Failed to parse resultJson`);
      }
    }

    // Sync ke database jika Kie.ai sudah selesai tapi DB masih processing
    await this.syncJobStatus(taskId, data.state, resultUrls, data.failMsg);

    return {
      taskId: data.taskId,
      state: data.state,
      model: data.model,
      resultUrls,
      failCode: data.failCode,
      failMsg: data.failMsg,
      costTime: data.costTime,
    };
  }

  async syncJobStatus(jobId: string, state: string, resultUrls: string[] = [], failMsg?: string) {
    const job = await this.galleryService.findJobByJobId(jobId);
    if (!job || job.status !== VideoJobStatus.PROCESSING) return;

    if (state === 'success') {
      for (let i = 0; i < resultUrls.length; i++) {
        try {
          await this.galleryService.upsertVideoToJob(jobId, i + 1, resultUrls[i], `pro-video-${i + 1}.mp4`);
        } catch (err) {
          this.logger.error(`[${jobId}] Sync: Failed to save video ${i + 1}: ${err.message}`);
        }
      }
      await this.galleryService.updateJobStatus(jobId, VideoJobStatus.SUCCESS);
      this.logger.log(`[${jobId}] Synced status to success`);
      this.eventEmitter.emit('pro.job.progress', { jobId, message: 'success', progress: 100, resultUrls });
    } else if (state === 'fail') {
      await this.galleryService.updateJobStatus(jobId, VideoJobStatus.FAILED, failMsg ?? undefined);
      this.logger.log(`[${jobId}] Synced status to failed`);
      this.eventEmitter.emit('pro.job.progress', { jobId, message: 'failed', progress: -1, failMsg });
    }
  }

  private logProgress(jobId: string, message: string, progress: number) {
    this.logger.log(`[${jobId}] ${message} (${progress}%)`);
    this.eventEmitter.emit('pro.job.progress', { jobId, message, progress });
  }
}
