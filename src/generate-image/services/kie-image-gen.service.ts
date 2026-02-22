import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface GeminiGenerationParams {
  prompt: string;
  modelBase64: string | null;
  productBase64: string;
  productImageUrl?: string;     // S3 URL — sent as image_input to Kie.ai
  negativePrompt?: string;
}

@Injectable()
export class GeminiImageGenService {
  private readonly logger = new Logger(GeminiImageGenService.name);
  private readonly baseUrl = 'https://api.kie.ai/api/v1';
  private readonly model = 'nano-banana-pro';

  constructor(private readonly configService: ConfigService) {}

  async generateImage(params: GeminiGenerationParams): Promise<Buffer> {
    const apiKey = this.configService.get<string>('KIE_AI');
    if (!apiKey) throw new InternalServerErrorException('KIE_AI key is not configured');

    // Step 1: Submit task to Kie.ai
    const taskId = await this.createTask(apiKey, params.prompt, params.productImageUrl);

    // Step 2: Poll until done (3s interval, max 120s)
    const resultUrl = await this.pollForResult(apiKey, taskId);

    // Step 3: Download image and return as Buffer
    return this.downloadImage(resultUrl);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async createTask(apiKey: string, prompt: string, productImageUrl?: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/jobs/createTask`,
        {
          model: this.model,
          input: {
            prompt,
            image_input: productImageUrl ? [productImageUrl] : [],
            aspect_ratio: '9:16',
            resolution: '1K',
            output_format: 'png',
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

      this.logger.log(`Task submitted → taskId: ${data.taskId}`);
      return data.taskId;
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || error.response?.data?.msg || error.message
        : (error as Error).message;
      this.logger.error(`createTask failed: ${msg}`);
      throw new InternalServerErrorException(`Kie.ai createTask failed: ${msg}`);
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
          throw new Error(`Kie.ai generation failed: ${data.failMsg || data.failCode || 'unknown'}`);
        }

        // still processing — continue polling
      } catch (error) {
        if (axios.isAxiosError(error)) {
          this.logger.warn(`Poll ${attempt}/${maxAttempts} — request error: ${error.message}`);
          continue; // transient network error — retry
        }
        throw error; // non-axios error (state=fail, parse error) — stop
      }
    }

    throw new InternalServerErrorException(`Kie.ai image generation timed out after ${maxAttempts * intervalMs / 1000}s`);
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }
}
