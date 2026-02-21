import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WavespeedVideoService {
  private readonly logger = new Logger(WavespeedVideoService.name);

  constructor(private configService: ConfigService) { }

  async generateVideo(prompt: string, imageUrl: string, index: number, reqId: string): Promise<string> {
    const apiKey = this.configService.get<string>('WAVESPEED_API_KEY');
    const urlSubmit = "https://api.wavespeed.ai/api/v3/bytedance/seedance-v1-pro-fast/image-to-video";

    try {
      const submitResp = await axios.post(urlSubmit, {
        camera_fixed: false,
        duration: 5,
        image: imageUrl,
        prompt: prompt,
        resolution: "720p",
        seed: -1
      }, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        }
      });

      const requestId = submitResp.data.data.id;
      this.logger.log(`[${reqId}] Wavespeed Job ID: ${requestId} (Clip ${index})`);

      let attempts = 0;
      while (attempts < 60) {
        attempts++;
        await new Promise(r => setTimeout(r, 3000));

        const statusResp = await axios.get(`https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`, {
          headers: { "Authorization": `Bearer ${apiKey}` }
        });

        const statusData = statusResp.data;

        if (statusData.data.status === "completed") {
          return statusData.data.outputs[0];
        }

        if (statusData.data.status === "failed") {
          throw new Error(statusData.data.error || "Generation Failed");
        }
      }

      throw new Error("Wavespeed Timeout");

    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Log seluruh data response untuk debugging
        this.logger.error(`[${reqId}][Clip ${index}] Status: ${error.response.status}`);
        this.logger.error(`[${reqId}][Clip ${index}] Response Data: ${JSON.stringify(error.response.data)}`);
      }

      const msg = axios.isAxiosError(error)
        ? error.response?.data?.error || error.message
        : (error as Error).message;

      this.logger.error(`[${reqId}][Clip ${index}] Wavespeed Error: ${msg}`);
      throw new Error(msg);
    }
  }
}