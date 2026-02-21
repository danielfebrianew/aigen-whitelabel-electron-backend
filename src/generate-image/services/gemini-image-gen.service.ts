import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

export interface GeminiGenerationParams {
  prompt: string;
  modelBase64: string | null;  // null kalau user tidak upload foto model
  productBase64: string;
  negativePrompt?: string;
}

@Injectable()
export class GeminiImageGenService {
  private readonly logger = new Logger(GeminiImageGenService.name);
  private readonly ai: GoogleGenAI;
  private readonly model = 'gemini-3-pro-image-preview';

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new InternalServerErrorException('GEMINI_API_KEY is not configured');
    }

    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateImage(params: GeminiGenerationParams): Promise<Buffer> {
    try {
      this.logger.log(`Sending image gen request (prompt: "${params.prompt.substring(0, 60)}...")`);

      // ─── Build parts ──────────────────────────────────────────────
      // Urutan: model image (kalau ada) → product image → prompt text.
      // Gemini baca context dari atas ke bawah.
      const parts: any[] = [];

      // Model image — optional. Kalau null, Gemini pakai AI-generated face dari prompt text.
      if (params.modelBase64) {
        parts.push({
          inlineData: {
            data: params.modelBase64,
            mimeType: 'image/png',
          },
        });
      }

      // Product image — selalu ada
      parts.push({
        inlineData: {
          data: params.productBase64,
          mimeType: 'image/png',
        },
      });

      const systemNote = `IMPORTANT: The product image above is the EXACT reference. 
The product you generate MUST visually match it precisely — same colors, shape, material, logos, and details. 
Do not change or reimagine any part of the product.\n\n`;

      parts.push({ text: systemNote + params.prompt });

      const contents = [{ role: 'user' as const, parts }];

      // ─── Config ───────────────────────────────────────────────────
      const config = {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio: '9:16',
          imageSize: '1K',
        },
      };

      // ─── Streaming call ───────────────────────────────────────────
      const response = await this.ai.models.generateContentStream({
        model: this.model,
        config,
        contents,
      });

      const imageBuffer = await this.extractImageFromStream(response);

      if (!imageBuffer) {
        throw new Error('Gemini did not return any image in the streamed response.');
      }

      this.logger.log('Image generation successful');
      return imageBuffer;

    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async extractImageFromStream(stream: AsyncIterable<any>): Promise<Buffer | null> {
    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;

      for (const part of parts) {
        if (part.inlineData?.data) {
          this.logger.log(`Got image chunk — mimeType: ${part.inlineData.mimeType || 'image/png'}`);
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }
    }
    return null;
  }

  private handleError(error: any) {
    if (error.response) {
      this.logger.error(`Gemini API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      this.logger.error(`Gemini Network Error: ${error.message}`);
    } else {
      this.logger.error(`Gemini Error: ${error.message}`);
    }
  }
}