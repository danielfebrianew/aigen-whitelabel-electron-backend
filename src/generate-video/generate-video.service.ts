import { Injectable, Logger, OnModuleInit, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as path from 'path';

import { AwsStorageService } from './services/aws-storage.service';
import { OpenAiScriptService } from './services/openai-script.service';
import { WavespeedVideoService } from './services/wavespeed-video.service';
import { ElevenLabsTtsService } from './services/elevenlabs-tts.service';
import { FfmpegMixService } from './services/ffmpeg-mixer.service';
import { VideoUtilsHelper } from './helpers/video-utils.helper';
import { GalleryService } from 'src/gallery/gallery.service';

@Injectable()
export class GenerateAiService implements OnModuleInit {
  private readonly logger = new Logger(GenerateAiService.name);
  private tempDir = './temp';

  constructor(
    private eventEmitter: EventEmitter2,
    private videoUtilsHelper: VideoUtilsHelper,
    private awsStorage: AwsStorageService,
    private openaiScript: OpenAiScriptService,
    private wavespeedVideo: WavespeedVideoService,
    private elevenlabsTts: ElevenLabsTtsService,
    private ffmpegMix: FfmpegMixService,
    private galleryService: GalleryService,
  ) {
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir);
  }

  async onModuleInit() {
    this.cleanTempFolder();
  }

  private cleanTempFolder() {
    try {
      if (!fs.existsSync(this.tempDir)) return;
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        if (file.endsWith('.mp4') || file.endsWith('.zip') || file.endsWith('.wav') || file.endsWith('.mp3')) {
          fs.unlinkSync(path.join(this.tempDir, file));
        }
      }
    } catch (error) {
      this.logger.error('Failed to clean temp folder:', error);
    }
  }

  private cleanup(files: string[]) {
    files.forEach(f => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (e) { this.logger.error(`Cleanup failed for ${f}`); }
      }
    });
  }

  // Method ini sudah PERFECT!
  private logProgress(jobId: string, message: string, progress: number) {
    this.logger.log(`[${jobId}] ${message}`);
    this.eventEmitter.emit('job.progress', { jobId, message, progress });
  }

  async uploadImages(files: Array<Express.Multer.File>) {
    const urls: string[] = [];
    for (const file of files) {
      const fileName = `input_${Date.now()}_${Math.round(Math.random() * 1000)}_${file.originalname}`;
      const url = await this.awsStorage.uploadFile(file.buffer, fileName, file.mimetype, 'inputs');
      urls.push(url);
    }
    return { imageUrls: urls };
  }

  async generateText(imageUrl: string, count: number, product: string) {
    return await this.openaiScript.analyzeImageAndCreateScript(imageUrl, count, product);
  }

  async processVideoVariations(images: string[], productName: string,prompts: string[], script: string, jobId: string, targetCount: number, voiceGender: string) {
    let cleanupFiles: string[] = [];
    const promptCount = prompts.length;

    // --- LOGIC RANDOM VOICE PICKER ---
    let voiceName = 'Rachel';

    if (voiceGender === 'male') {
      const maleVoices = ['Roger', 'Charlie', 'George', 'Callum', 'Liam', 'Chris', 'Brian', 'Daniel'];
      voiceName = maleVoices[Math.floor(Math.random() * maleVoices.length)];
    } else {
      const femaleVoices = ['Rachel', 'Sarah', 'Laura', 'Charlotte', 'Jessica', 'Lily', 'Alice', 'Matilda'];
      voiceName = femaleVoices[Math.floor(Math.random() * femaleVoices.length)];
    }

    this.logger.log(`Job ${jobId}: Gender '${voiceGender}' -> Selected Voice: '${voiceName}'`);

    // Validation
    if (promptCount < 4 || promptCount > 6) {
      throw new BadRequestException(`Jumlah prompt harus antara 4-6. Kamu kirim ${promptCount}.`);
    }

    if (targetCount < 1 || targetCount > 100) {
      throw new BadRequestException(`Jumlah variasi video harus antara 1-100. Kamu minta: ${targetCount}`);
    }

    // Save job metadata to DB first to prevent connection timeout
    try {
      await this.galleryService.createJobMetadata(
        jobId,
        productName,
        script,
        voiceGender,
        prompts.length,
        targetCount,
        prompts,
        images,
        images[0],
      );
      this.logger.log(`[${jobId}] Job metadata saved to database`);
    } catch (dbError) {
      this.logger.error(`[${jobId}] Failed to save job metadata:`, dbError);
      throw new InternalServerErrorException('Failed to save job metadata to database');
    }

    try {
      this.logProgress(jobId, "=== STARTING AI ENGINE ===", 0);

      // ✅ STEP 2: Generate video clips (0-25%)
      this.logProgress(jobId, "Generating video clips...", 5);

      const videoTasks = prompts.map(async (prompt, idx) => {
        const selectedImage = images[idx] ? images[idx] : images[0];
        try {
          const url = await this.wavespeedVideo.generateVideo(prompt, selectedImage, idx, jobId);
          return { status: 'success', url, index: idx };
        } catch (err) {
          return { status: 'failed', error: err, index: idx };
        }
      });

      //  STEP 3: Generate audio in parallel (5-15%)
      this.logProgress(jobId, "Generating voiceover...", 10);

      const audioTask = this.elevenlabsTts.generateAudio(script, this.tempDir, voiceName);

      const [videoResults, audioPath] = await Promise.all([
        Promise.all(videoTasks),
        audioTask
      ]);
      cleanupFiles.push(audioPath);

      // STEP 4: Validate clips (15-20%)
      this.logProgress(jobId, "Validating video clips...", 15);

      const successVideos = videoResults
        .filter((r): r is { status: 'success', url: string, index: number } => r.status === 'success')
        .sort((a, b) => a.index - b.index);

      if (successVideos.length !== promptCount) {
        throw new Error(`Failed to generate all video clips. Got ${successVideos.length}/${promptCount}`);
      }

      //  STEP 5: Download clips (20-40%)
      this.logProgress(jobId, `Downloading ${successVideos.length} clips...`, 20);

      const rawClipPaths: string[] = [];
      const totalClips = successVideos.length;

      for (let i = 0; i < totalClips; i++) {
        const vid = successVideos[i];
        const rawFileName = path.join(this.tempDir, `raw_${jobId}_${vid.index}.mp4`);

        //  Progress per clip: 20% -> 40% (20% range / totalClips)
        const downloadProgress = 20 + Math.floor(((i + 1) / totalClips) * 20);
        this.logProgress(jobId, `Downloading clip ${i + 1}/${totalClips}...`, downloadProgress);

        await this.videoUtilsHelper.downloadFile(vid.url, rawFileName);
        rawClipPaths.push(rawFileName);
        cleanupFiles.push(rawFileName);
      }

      //  STEP 6: Generate unique shuffles (40-45%)
      this.logProgress(jobId, `Creating ${targetCount} unique variations...`, 40);

      const uniqueOrders = this.videoUtilsHelper.generateUniqueShuffles(promptCount, targetCount);
      
      this.logProgress(jobId, `Generated ${uniqueOrders.length} unique orders`, 45);

      // STEP 7: Stitch & Upload variations (45-100%)
      const resultUrls: string[] = [];
      const totalVariations = uniqueOrders.length;

      for (let i = 0; i < totalVariations; i++) {
        const order = uniqueOrders[i];
        const orderedPaths = order.map(index => rawClipPaths[index]);

        // Stitch visuals
        const tempVisualPath = path.join(this.tempDir, `vis_${jobId}_${i}.mp4`);
        cleanupFiles.push(tempVisualPath);

        // ✅ Progress: 45% -> 70% (stitching phase)
        const stitchProgress = 45 + Math.floor((i / totalVariations) * 25);
        this.logProgress(jobId, `Stitching variation ${i + 1}/${totalVariations}...`, stitchProgress);

        await this.ffmpegMix.stitchVisuals(orderedPaths, tempVisualPath);

        // Merge audio
        const finalFileName = `VARIATION_${jobId}_${i + 1}.mp4`;
        const finalVarPath = path.join(this.tempDir, `VAR_${jobId}_${i}.mp4`);
        cleanupFiles.push(finalVarPath);

        // Progress: 70% -> 85% (merging phase)
        const mergeProgress = 70 + Math.floor((i / totalVariations) * 15);
        this.logProgress(jobId, `Merging audio for variation ${i + 1}/${totalVariations}...`, mergeProgress);

        await this.ffmpegMix.mergeAudioVisual(tempVisualPath, audioPath, finalVarPath);

        // Upload to S3
        // Progress: 85% -> 100% (upload phase)
        const uploadProgress = 85 + Math.floor(((i + 1) / totalVariations) * 15);
        this.logProgress(jobId, `Uploading variation ${i + 1}/${totalVariations}...`, uploadProgress);

        const s3Url = await this.awsStorage.uploadFile(finalVarPath, finalFileName, 'video/mp4', `results/${jobId}`);
        resultUrls.push(s3Url);
      }
      
      // Add videos to existing job
      this.logProgress(jobId, "Saving videos to gallery...", 99);

      try {
        await this.galleryService.addVideosToJob(
          jobId,
          images[0],
          resultUrls.map((url, idx) => ({
            variationNumber: idx + 1,
            videoUrl: url,
            fileName: `VARIATION_${jobId}_${idx + 1}.mp4`
          }))
        );

        this.logger.log(`[${jobId}] Successfully saved ${resultUrls.length} videos to gallery`);
      } catch (dbError) {
        this.logger.error(`[${jobId}] FAILED to save videos to gallery:`, dbError);

        throw new InternalServerErrorException(
          `Video generation succeeded but failed to save videos to gallery: ${dbError.message || 'Unknown error'}`
        );
      }

    // STEP 8: Cleanup & Complete (100%)
    this.logProgress(jobId, "Cleaning up temporary files...", 98);
    this.cleanup(cleanupFiles);
    
    this.logProgress(jobId, "Process Completed! All videos ready.", 100);
    
      return {
        jobId,
        totalVariations: resultUrls.length,
        variations: resultUrls
      };

    } catch (error) {
      this.cleanup(cleanupFiles);

      if (error instanceof BadRequestException) {
        throw error;
      }

      const msg = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`[${jobId}] ERROR: ${msg}`);
      
      // ✅ Emit error to frontend
      this.logProgress(jobId, `Error: ${msg}`, 0);
      
      throw new InternalServerErrorException(msg);
    }
  }
}