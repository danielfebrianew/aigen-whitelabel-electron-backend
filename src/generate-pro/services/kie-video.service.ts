import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class KieVideoService {
  private readonly logger = new Logger(KieVideoService.name);
  private readonly baseUrl = 'https://api.kie.ai/api/v1';

  constructor(private configService: ConfigService) {}

  async createTask(
    prompt: string,
    imageUrl: string,
    aspectRatio: string,
    nFrames: string,
    callBackUrl: string,
    progressCallBackUrl: string,
    reqId: string,
  ): Promise<string> {
    const apiKey = this.configService.get<string>('KIE_AI');

    try {
      const response = await axios.post(
        `${this.baseUrl}/jobs/createTask`,
        {
          model: 'sora-2-image-to-video',
          callBackUrl,
          progressCallBackUrl,
          input: {
            prompt,
            image_urls: [imageUrl],
            aspect_ratio: aspectRatio,
            n_frames: nFrames,
            remove_watermark: true,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      this.logger.log(`[${reqId}] Kie.ai Response: ${JSON.stringify(response.data)}`);

      const { code, data, message, msg } = response.data;

      if (code !== 200) {
        throw new Error(`Kie.ai returned error: ${message || msg || JSON.stringify(response.data)}`);
      }

      this.logger.log(`[${reqId}] Kie.ai Task ID: ${data.taskId}`);
      return data.taskId;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(`[${reqId}] Status: ${error.response.status}`);
        this.logger.error(
          `[${reqId}] Response Body: ${JSON.stringify(error.response.data) ?? 'empty'}`,
        );
        this.logger.error(`[${reqId}] Prompt: ${prompt}`);
      }

      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || error.response?.data?.error || error.message
        : (error as Error).message;

      this.logger.error(`[${reqId}] Kie.ai Error: ${msg}`);
      throw new Error(msg);
    }
  }

  async queryTask(taskId: string): Promise<any> {
    const apiKey = this.configService.get<string>('KIE_AI');

    try {
      const response = await axios.get(
        `${this.baseUrl}/jobs/recordInfo`,
        {
          params: { taskId },
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      this.logger.log(`[${taskId}] Query response: ${JSON.stringify(response.data)}`);

      const { code, data, message, msg } = response.data;

      if (code !== 200) {
        throw new Error(`Kie.ai query error: ${message || msg}`);
      }

      return data;
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || error.response?.data?.error || error.message
        : (error as Error).message;

      this.logger.error(`[${taskId}] Query error: ${msg}`);
      throw new Error(msg);
    }
  }
}
