import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ElevenLabsTtsService {
  private readonly logger = new Logger(ElevenLabsTtsService.name);
  private readonly baseUrl = 'https://api.kie.ai/api/v1';
  private readonly model = 'elevenlabs/text-to-speech-multilingual-v2';

  constructor(private readonly configService: ConfigService) {}

  async generateAudio(text: string, outputDir: string, voiceName: string): Promise<string> {
    const apiKey = this.configService.get<string>('KIE_AI');
    if (!apiKey) throw new InternalServerErrorException('KIE_AI key is not configured');

    const taskId = await this.createTask(apiKey, text, voiceName);
    const resultUrl = await this.pollForResult(apiKey, taskId);
    const outputPath = path.join(outputDir, `audio_${Date.now()}.mp3`);
    await this.downloadAudio(resultUrl, outputPath);

    return outputPath;
  }

  private async createTask(apiKey: string, text: string, voice: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/jobs/createTask`,
        {
          model: this.model,
          input: {
            text,
            voice,
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
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      const { code, data, message, msg } = response.data;

      if (code !== 200) {
        throw new Error(`Kie.ai error: ${message || msg || JSON.stringify(response.data)}`);
      }

      this.logger.log(`TTS task submitted → taskId: ${data.taskId}`);
      return data.taskId;
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || error.response?.data?.msg || error.message
        : (error as Error).message;
      this.logger.error(`createTask failed: ${msg}`);
      throw new InternalServerErrorException(`ElevenLabs TTS createTask failed: ${msg}`);
    }
  }

  private async pollForResult(apiKey: string, taskId: string): Promise<string> {
    const maxAttempts = 40;
    const intervalMs = 3000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      try {
        const response = await axios.get(`${this.baseUrl}/jobs/recordInfo`, {
          params: { taskId },
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        const { code, data } = response.data;

        if (code !== 200 || !data) {
          this.logger.warn(`Poll ${attempt}/${maxAttempts} — unexpected response code ${code}`);
          continue;
        }

        this.logger.log(`Poll ${attempt}/${maxAttempts} — state: ${data.state}`);

        if (data.state === 'success') {
          let resultUrls: string[] = [];
          try {
            resultUrls = JSON.parse(data.resultJson ?? '{}').resultUrls ?? [];
          } catch {
            throw new Error('Failed to parse resultJson from Kie.ai');
          }

          if (!resultUrls.length) throw new Error('Kie.ai returned empty resultUrls');
          return resultUrls[0];
        }

        if (data.state === 'fail') {
          throw new Error(`ElevenLabs TTS failed: ${data.failMsg || data.failCode || 'unknown'}`);
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          this.logger.warn(`Poll ${attempt}/${maxAttempts} — request error: ${error.message}`);
          continue;
        }
        throw error;
      }
    }

    throw new InternalServerErrorException(
      `ElevenLabs TTS timed out after ${(maxAttempts * intervalMs) / 1000}s`,
    );
  }

  private async downloadAudio(url: string, outputPath: string): Promise<void> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.promises.writeFile(outputPath, Buffer.from(response.data));
    this.logger.log(`Audio downloaded → ${outputPath}`);
  }
}
