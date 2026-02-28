import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GenerateAiService } from './generate-video.service';
import { AwsStorageService } from './services/aws-storage.service';
import { OpenAiScriptService } from './services/openai-script.service';
import { WavespeedVideoService } from './services/wavespeed-video.service';
import { ElevenLabsTtsService } from './services/elevenlabs-tts.service';
import { FfmpegMixService } from './services/ffmpeg-mixer.service';
import { VideoUtilsHelper } from './helpers/video-utils.helper';
// Mock gallery service module to prevent TypeORM import chain
jest.mock('src/gallery/gallery.service', () => ({
  GalleryService: jest.fn(),
}));
import { GalleryService } from 'src/gallery/gallery.service';

// Mock fs while preserving native property for path-scurry compatibility
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn().mockReturnValue([]),
    unlinkSync: jest.fn(),
  };
});

describe('GenerateAiService', () => {
  let service: GenerateAiService;
  let eventEmitter: EventEmitter2;
  let videoUtilsHelper: jest.Mocked<VideoUtilsHelper>;
  let awsStorage: jest.Mocked<AwsStorageService>;
  let openaiScript: jest.Mocked<OpenAiScriptService>;
  let wavespeedVideo: jest.Mocked<WavespeedVideoService>;
  let elevenlabsTts: jest.Mocked<ElevenLabsTtsService>;
  let ffmpegMix: jest.Mocked<FfmpegMixService>;
  let galleryService: jest.Mocked<GalleryService>;

  beforeEach(async () => {

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerateAiService,
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: VideoUtilsHelper,
          useValue: {
            downloadFile: jest.fn().mockResolvedValue(undefined),
            generateUniqueShuffles: jest.fn().mockReturnValue([[0, 1, 2, 3]]),
          },
        },
        {
          provide: AwsStorageService,
          useValue: {
            uploadFile: jest.fn().mockResolvedValue('https://s3.amazonaws.com/bucket/video.mp4'),
          },
        },
        {
          provide: OpenAiScriptService,
          useValue: {
            analyzeImageAndCreateScript: jest.fn().mockResolvedValue({
              voiceover: 'Test script',
              videoPrompts: ['p1', 'p2', 'p3', 'p4'],
            }),
          },
        },
        {
          provide: WavespeedVideoService,
          useValue: {
            generateVideo: jest.fn().mockResolvedValue('https://wavespeed.ai/clip.mp4'),
          },
        },
        {
          provide: ElevenLabsTtsService,
          useValue: {
            generateAudio: jest.fn().mockResolvedValue('./temp/audio_123.mp3'),
          },
        },
        {
          provide: FfmpegMixService,
          useValue: {
            stitchVisuals: jest.fn().mockResolvedValue('./temp/stitched.mp4'),
            mergeAudioVisual: jest.fn().mockResolvedValue('./temp/final.mp4'),
          },
        },
        {
          provide: GalleryService,
          useValue: {
            createJobMetadata: jest.fn().mockResolvedValue({ id: 1, jobId: 'job-123' }),
            addVideosToJob: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<GenerateAiService>(GenerateAiService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    videoUtilsHelper = module.get(VideoUtilsHelper);
    awsStorage = module.get(AwsStorageService);
    openaiScript = module.get(OpenAiScriptService);
    wavespeedVideo = module.get(WavespeedVideoService);
    elevenlabsTts = module.get(ElevenLabsTtsService);
    ffmpegMix = module.get(FfmpegMixService);
    galleryService = module.get(GalleryService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('uploadImages', () => {
    it('should upload files and return URLs', async () => {
      const mockFiles = [
        { buffer: Buffer.from('img1'), originalname: 'test.jpg', mimetype: 'image/jpeg' },
        { buffer: Buffer.from('img2'), originalname: 'test2.png', mimetype: 'image/png' },
      ] as Express.Multer.File[];

      awsStorage.uploadFile
        .mockResolvedValueOnce('https://s3.com/img1.jpg')
        .mockResolvedValueOnce('https://s3.com/img2.png');

      const result = await service.uploadImages(mockFiles);

      expect(result.imageUrls).toHaveLength(2);
      expect(awsStorage.uploadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateText', () => {
    it('should delegate to openaiScript service', async () => {
      await service.generateText('https://img.com/photo.jpg', 4, 'Product X');
      expect(openaiScript.analyzeImageAndCreateScript).toHaveBeenCalledWith(
        'https://img.com/photo.jpg', 4, 'Product X',
      );
    });
  });

  describe('processVideoVariations', () => {
    const baseArgs = {
      images: ['https://s3.com/img1.jpg'],
      productName: 'Test Product',
      prompts: ['prompt1', 'prompt2', 'prompt3', 'prompt4'],
      script: 'This is a test voiceover script.',
      jobId: 'job-123',
      targetCount: 1,
    };

    it('should process video variations end-to-end with female voice', async () => {
      const result = await service.processVideoVariations(
        baseArgs.images, baseArgs.productName, baseArgs.prompts,
        baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
      );

      expect(result.jobId).toBe('job-123');
      expect(result.totalVariations).toBe(1);
      expect(result.variations).toHaveLength(1);

      // Verify ElevenLabs TTS was called with a female voice
      const ttsCall = elevenlabsTts.generateAudio.mock.calls[0];
      expect(ttsCall[0]).toBe(baseArgs.script);
      const femaleVoices = ['Rachel', 'Sarah', 'Laura', 'Charlotte', 'Jessica', 'Lily', 'Alice', 'Matilda'];
      expect(femaleVoices).toContain(ttsCall[2]);
    });

    it('should select a male voice when voiceGender is male', async () => {
      await service.processVideoVariations(
        baseArgs.images, baseArgs.productName, baseArgs.prompts,
        baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'male',
      );

      const ttsCall = elevenlabsTts.generateAudio.mock.calls[0];
      const maleVoices = ['Roger', 'Charlie', 'George', 'Callum', 'Liam', 'Chris', 'Brian', 'Daniel'];
      expect(maleVoices).toContain(ttsCall[2]);
    });

    it('should default to female voice when gender not male', async () => {
      await service.processVideoVariations(
        baseArgs.images, baseArgs.productName, baseArgs.prompts,
        baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
      );

      const ttsCall = elevenlabsTts.generateAudio.mock.calls[0];
      const femaleVoices = ['Rachel', 'Sarah', 'Laura', 'Charlotte', 'Jessica', 'Lily', 'Alice', 'Matilda'];
      expect(femaleVoices).toContain(ttsCall[2]);
    });

    it('should throw BadRequestException for invalid prompt count (< 4)', async () => {
      await expect(
        service.processVideoVariations(
          baseArgs.images, baseArgs.productName, ['p1', 'p2', 'p3'],
          baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid prompt count (> 6)', async () => {
      await expect(
        service.processVideoVariations(
          baseArgs.images, baseArgs.productName,
          ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
          baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid targetCount (0)', async () => {
      await expect(
        service.processVideoVariations(
          baseArgs.images, baseArgs.productName, baseArgs.prompts,
          baseArgs.script, baseArgs.jobId, 0, 'female',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid targetCount (> 100)', async () => {
      await expect(
        service.processVideoVariations(
          baseArgs.images, baseArgs.productName, baseArgs.prompts,
          baseArgs.script, baseArgs.jobId, 101, 'female',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should call galleryService.createJobMetadata before processing', async () => {
      await service.processVideoVariations(
        baseArgs.images, baseArgs.productName, baseArgs.prompts,
        baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
      );

      expect(galleryService.createJobMetadata).toHaveBeenCalledWith(
        'job-123', 'Test Product', baseArgs.script, 'female',
        4, 1, baseArgs.prompts, baseArgs.images, baseArgs.images[0],
      );
    });

    it('should throw InternalServerErrorException when metadata save fails', async () => {
      galleryService.createJobMetadata.mockRejectedValueOnce(new Error('DB down'));

      await expect(
        service.processVideoVariations(
          baseArgs.images, baseArgs.productName, baseArgs.prompts,
          baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw when not all video clips are generated', async () => {
      wavespeedVideo.generateVideo
        .mockResolvedValueOnce('https://wavespeed.ai/clip1.mp4')
        .mockRejectedValueOnce(new Error('Generation failed'))
        .mockResolvedValueOnce('https://wavespeed.ai/clip3.mp4')
        .mockResolvedValueOnce('https://wavespeed.ai/clip4.mp4');

      await expect(
        service.processVideoVariations(
          baseArgs.images, baseArgs.productName, baseArgs.prompts,
          baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should emit progress events during processing', async () => {
      await service.processVideoVariations(
        baseArgs.images, baseArgs.productName, baseArgs.prompts,
        baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith('job.progress', expect.objectContaining({
        jobId: 'job-123',
      }));

      // Should have emitted multiple progress events
      expect((eventEmitter.emit as jest.Mock).mock.calls.length).toBeGreaterThan(5);
    });

    it('should call ffmpegMix for stitching and merging', async () => {
      await service.processVideoVariations(
        baseArgs.images, baseArgs.productName, baseArgs.prompts,
        baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
      );

      expect(ffmpegMix.stitchVisuals).toHaveBeenCalledTimes(1);
      expect(ffmpegMix.mergeAudioVisual).toHaveBeenCalledTimes(1);
    });

    it('should upload final variations to S3', async () => {
      await service.processVideoVariations(
        baseArgs.images, baseArgs.productName, baseArgs.prompts,
        baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
      );

      expect(awsStorage.uploadFile).toHaveBeenCalledWith(
        expect.stringContaining('VAR_job-123'),
        'VARIATION_job-123_1.mp4',
        'video/mp4',
        'results/job-123',
      );
    });

    it('should save videos to gallery after upload', async () => {
      await service.processVideoVariations(
        baseArgs.images, baseArgs.productName, baseArgs.prompts,
        baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
      );

      expect(galleryService.addVideosToJob).toHaveBeenCalledWith(
        'job-123',
        baseArgs.images[0],
        [{ variationNumber: 1, videoUrl: expect.any(String), fileName: 'VARIATION_job-123_1.mp4' }],
      );
    });

    it('should throw when gallery save fails after video generation', async () => {
      galleryService.addVideosToJob.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        service.processVideoVariations(
          baseArgs.images, baseArgs.productName, baseArgs.prompts,
          baseArgs.script, baseArgs.jobId, baseArgs.targetCount, 'female',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
