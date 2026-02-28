import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import { ElevenLabsTtsService } from './elevenlabs-tts.service';

jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  isAxiosError: jest.fn().mockReturnValue(false),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ElevenLabsTtsService', () => {
  let service: ElevenLabsTtsService;
  let configService: ConfigService;

  const mockApiKey = 'test-api-key-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElevenLabsTtsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'KIE_AI') return mockApiKey;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ElevenLabsTtsService>(ElevenLabsTtsService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
  });

  describe('generateAudio', () => {
    const mockText = 'Hello world, this is a test script.';
    const mockOutputDir = './temp';
    const mockVoiceName = 'Rachel';
    const mockTaskId = 'task_abc123';
    const mockResultUrl = 'https://example.com/audio.mp3';

    beforeEach(() => {
      jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();
    });

    it('should generate audio successfully (create → poll → download)', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { taskId: mockTaskId }, message: 'success' },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            state: 'success',
            resultJson: JSON.stringify({ resultUrls: [mockResultUrl] }),
          },
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-audio-data'),
      });

      const result = await service.generateAudio(mockText, mockOutputDir, mockVoiceName);

      expect(result).toMatch(/temp[/\\]audio_\d+\.mp3$/);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.kie.ai/api/v1/jobs/createTask',
        {
          model: 'elevenlabs/text-to-speech-multilingual-v2',
          input: {
            text: mockText,
            voice: mockVoiceName,
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0,
            speed: 1,
            timestamps: false,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockApiKey}`,
          },
        },
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.kie.ai/api/v1/jobs/recordInfo',
        {
          params: { taskId: mockTaskId },
          headers: { Authorization: `Bearer ${mockApiKey}` },
        },
      );

      expect(fs.promises.writeFile).toHaveBeenCalled();
    }, 10000);

    it('should throw if KIE_AI key is missing', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      await expect(
        service.generateAudio(mockText, mockOutputDir, mockVoiceName),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw if createTask returns non-200 code', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { code: 400, message: 'Bad request' },
      });

      await expect(
        service.generateAudio(mockText, mockOutputDir, mockVoiceName),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw if createTask network request fails', async () => {
      const axiosError = new Error('Network Error');
      mockedAxios.post.mockRejectedValueOnce(axiosError);
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);

      await expect(
        service.generateAudio(mockText, mockOutputDir, mockVoiceName),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should poll multiple times before success', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { taskId: mockTaskId } },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: { code: 200, data: { state: 'processing' } },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            state: 'success',
            resultJson: JSON.stringify({ resultUrls: [mockResultUrl] }),
          },
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('audio-data'),
      });

      const result = await service.generateAudio(mockText, mockOutputDir, mockVoiceName);
      expect(result).toMatch(/\.mp3$/);
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    }, 15000);

    it('should throw when poll returns fail state', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { taskId: mockTaskId } },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: { state: 'fail', failMsg: 'Voice not found' },
        },
      });

      await expect(
        service.generateAudio(mockText, mockOutputDir, mockVoiceName),
      ).rejects.toThrow('ElevenLabs TTS failed: Voice not found');
    }, 10000);

    it('should throw when resultJson has empty resultUrls', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { taskId: mockTaskId } },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            state: 'success',
            resultJson: JSON.stringify({ resultUrls: [] }),
          },
        },
      });

      await expect(
        service.generateAudio(mockText, mockOutputDir, mockVoiceName),
      ).rejects.toThrow('Kie.ai returned empty resultUrls');
    }, 10000);

    it('should throw when resultJson is invalid JSON', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { taskId: mockTaskId } },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: { state: 'success', resultJson: 'not-json' },
        },
      });

      await expect(
        service.generateAudio(mockText, mockOutputDir, mockVoiceName),
      ).rejects.toThrow('Failed to parse resultJson from Kie.ai');
    }, 10000);

    it('should continue polling on transient network errors', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { taskId: mockTaskId } },
      });

      const axiosError = new Error('timeout');
      mockedAxios.get.mockRejectedValueOnce(axiosError);
      (axios.isAxiosError as unknown as jest.Mock)
        .mockReturnValueOnce(true)   // first poll catch
        .mockReturnValue(false);

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            state: 'success',
            resultJson: JSON.stringify({ resultUrls: [mockResultUrl] }),
          },
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('audio-data'),
      });

      const result = await service.generateAudio(mockText, mockOutputDir, mockVoiceName);
      expect(result).toMatch(/\.mp3$/);
    }, 15000);
  });
});
