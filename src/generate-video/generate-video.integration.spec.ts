import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Reflector } from '@nestjs/core';
import { GenerateAiController } from './generate-video.controller';
import { GenerateAiService } from './generate-video.service';
import { VideoUtilsHelper } from './helpers/video-utils.helper';
import { AwsStorageService } from './services/aws-storage.service';
import { OpenAiScriptService } from './services/openai-script.service';
import { WavespeedVideoService } from './services/wavespeed-video.service';
import { ElevenLabsTtsService } from './services/elevenlabs-tts.service';
import { FfmpegMixService } from './services/ffmpeg-mixer.service';
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

/**
 * Integration test for the generate-video module.
 * External services are mocked, but NestJS DI wiring, controller routing,
 * DTO validation, and service orchestration are tested end-to-end.
 */
describe('GenerateVideo Integration', () => {
  let app: INestApplication;
  let elevenlabsTts: jest.Mocked<ElevenLabsTtsService>;
  let wavespeedVideo: jest.Mocked<WavespeedVideoService>;
  let awsStorage: jest.Mocked<AwsStorageService>;
  let openaiScript: jest.Mocked<OpenAiScriptService>;
  let ffmpegMix: jest.Mocked<FfmpegMixService>;
  let galleryService: jest.Mocked<GalleryService>;
  let videoUtilsHelper: jest.Mocked<VideoUtilsHelper>;

  beforeAll(async () => {

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
      ],
      controllers: [GenerateAiController],
      providers: [
        GenerateAiService,
        Reflector,
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
            uploadFile: jest.fn().mockResolvedValue('https://s3.amazonaws.com/bucket/result.mp4'),
          },
        },
        {
          provide: OpenAiScriptService,
          useValue: {
            analyzeImageAndCreateScript: jest.fn().mockResolvedValue({
              voiceover: 'Generated script',
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
            generateAudio: jest.fn().mockResolvedValue('./temp/audio_test.mp3'),
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
            createJobMetadata: jest.fn().mockResolvedValue({ id: 1, jobId: 'integration-job-001' }),
            addVideosToJob: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    elevenlabsTts = moduleFixture.get(ElevenLabsTtsService);
    wavespeedVideo = moduleFixture.get(WavespeedVideoService);
    awsStorage = moduleFixture.get(AwsStorageService);
    openaiScript = moduleFixture.get(OpenAiScriptService);
    ffmpegMix = moduleFixture.get(FfmpegMixService);
    galleryService = moduleFixture.get(GalleryService);
    videoUtilsHelper = moduleFixture.get(VideoUtilsHelper);
  });

  afterAll(async () => {
    if (app) await app.close();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    elevenlabsTts.generateAudio.mockResolvedValue('./temp/audio_test.mp3');
    wavespeedVideo.generateVideo.mockResolvedValue('https://wavespeed.ai/clip.mp4');
    awsStorage.uploadFile.mockResolvedValue('https://s3.amazonaws.com/bucket/result.mp4');
    ffmpegMix.stitchVisuals.mockResolvedValue('./temp/stitched.mp4');
    ffmpegMix.mergeAudioVisual.mockResolvedValue('./temp/final.mp4');
    videoUtilsHelper.downloadFile.mockResolvedValue(undefined);
    videoUtilsHelper.generateUniqueShuffles.mockReturnValue([[0, 1, 2, 3]]);
    galleryService.createJobMetadata.mockResolvedValue({ id: 1, jobId: 'mock-job' } as any);
    galleryService.addVideosToJob.mockResolvedValue(undefined);
  });

  describe('POST /generate/video', () => {
    const validPayload = {
      images: ['https://s3.amazonaws.com/bucket/img1.jpg'],
      productName: 'Test Product',
      prompts: ['prompt1', 'prompt2', 'prompt3', 'prompt4'],
      script: 'This is a test voiceover script for the video.',
      jobId: 'integration-job-001',
      targetCount: 1,
      voiceGender: 'female',
    };

    it('should process video with female voice and return 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/generate/video')
        .send(validPayload)
        .expect(201);

      expect(res.body).toBeDefined();

      expect(elevenlabsTts.generateAudio).toHaveBeenCalledTimes(1);
      const [text, , voice] = elevenlabsTts.generateAudio.mock.calls[0];
      expect(text).toBe(validPayload.script);
      const femaleVoices = ['Rachel', 'Sarah', 'Laura', 'Charlotte', 'Jessica', 'Lily', 'Alice', 'Matilda'];
      expect(femaleVoices).toContain(voice);
    });

    it('should process video with male voice', async () => {
      const res = await request(app.getHttpServer())
        .post('/generate/video')
        .send({ ...validPayload, voiceGender: 'male' })
        .expect(201);

      expect(res.body).toBeDefined();

      const [, , voice] = elevenlabsTts.generateAudio.mock.calls[0];
      const maleVoices = ['Roger', 'Charlie', 'George', 'Callum', 'Liam', 'Chris', 'Brian', 'Daniel'];
      expect(maleVoices).toContain(voice);
    });

    it('should call the full pipeline: wavespeed → elevenlabs → ffmpeg → s3 → gallery', async () => {
      await request(app.getHttpServer())
        .post('/generate/video')
        .send(validPayload)
        .expect(201);

      expect(wavespeedVideo.generateVideo).toHaveBeenCalledTimes(4);
      expect(elevenlabsTts.generateAudio).toHaveBeenCalledTimes(1);
      expect(videoUtilsHelper.downloadFile).toHaveBeenCalledTimes(4);
      expect(ffmpegMix.stitchVisuals).toHaveBeenCalledTimes(1);
      expect(ffmpegMix.mergeAudioVisual).toHaveBeenCalledTimes(1);
      expect(awsStorage.uploadFile).toHaveBeenCalledTimes(1);
      expect(galleryService.createJobMetadata).toHaveBeenCalledTimes(1);
      expect(galleryService.addVideosToJob).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid voiceGender', async () => {
      await request(app.getHttpServer())
        .post('/generate/video')
        .send({ ...validPayload, voiceGender: 'robot' })
        .expect(400);
    });

    it('should reject missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/generate/video')
        .send({ productName: 'Test' })
        .expect(400);
    });

    it('should reject invalid image URLs', async () => {
      await request(app.getHttpServer())
        .post('/generate/video')
        .send({ ...validPayload, images: ['not-a-url'] })
        .expect(400);
    });

    it('should return 500 when TTS service fails', async () => {
      elevenlabsTts.generateAudio.mockRejectedValueOnce(new Error('Kie.ai TTS timeout'));

      await request(app.getHttpServer())
        .post('/generate/video')
        .send(validPayload)
        .expect(500);
    });

    it('should return 500 when all video clips fail', async () => {
      wavespeedVideo.generateVideo.mockRejectedValue(new Error('Wavespeed down'));

      await request(app.getHttpServer())
        .post('/generate/video')
        .send(validPayload)
        .expect(500);
    });
  });

  describe('POST /generate/text', () => {
    it('should generate text from image', async () => {
      const res = await request(app.getHttpServer())
        .post('/generate/text')
        .send({
          imageUrl: 'https://s3.amazonaws.com/bucket/product.jpg',
          promptCount: 4,
          productName: 'My Product',
        })
        .expect(201);

      expect(res.body).toBeDefined();
      expect(openaiScript.analyzeImageAndCreateScript).toHaveBeenCalledWith(
        'https://s3.amazonaws.com/bucket/product.jpg', 4, 'My Product',
      );
    });

    it('should reject invalid imageUrl', async () => {
      await request(app.getHttpServer())
        .post('/generate/text')
        .send({ imageUrl: 'not-a-url', promptCount: 4, productName: 'Test' })
        .expect(400);
    });
  });
});
