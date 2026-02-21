//generate-image.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GeminiImageGenService } from './services/gemini-image-gen.service';
import { AwsStorageService } from './services/aws-storage.service';
import { OpenAiPromptService } from './services/openai-prompt.service';
import {
  GenerateImageRequestDto,
  GenerateImageResponse,
  ImageVariant,
} from './dto/generate-image.dto';
import { generateJobId } from './helpers/generate-job-id.helper';
import { BACKGROUND_FALLBACKS, BackgroundKey } from './helpers/prompt-template.helper';

@Injectable()
export class GenerateImageService {
  private readonly logger = new Logger(GenerateImageService.name);
  private readonly ai: GoogleGenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiImageGenService: GeminiImageGenService,
    private readonly awsStorageService: AwsStorageService,
    private readonly openAiPromptService: OpenAiPromptService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.ai = new GoogleGenAI({ apiKey });
  }

  // ─── Entry point ──────────────────────────────────────────────────────────

  async generateImage(
    dto: GenerateImageRequestDto,
    files: { modelImage: Express.Multer.File | null; productImage: Express.Multer.File },
  ): Promise<GenerateImageResponse> {
    const startTime = Date.now();
    const jobId = generateJobId();
    this.logger.log(`[${jobId}] Starting — category: ${dto.category}`);

    // ─── Prep base64 ────────────────────────────────────────────────
    const productBase64 = files.productImage.buffer.toString('base64');
    const modelBase64 = files.modelImage ? files.modelImage.buffer.toString('base64') : null;
    const hasModelImage = modelBase64 !== null;

    // ─── Step 1: Resolve background ─────────────────────────────────
    // User isi atmosphere → pakai langsung.
    // Kosong → analisis warna produk via Gemini, auto-pick dari 3 fallback.
    const background = dto.background
      ? dto.background
      : await this.resolveBackgroundFromProduct(productBase64);

    this.logger.log(`[${jobId}] Background resolved: "${background}"`);

    // ─── Step 2: Generate 6 prompts via OpenAI ─────────────────────
    // GPT-4o lihat foto produk (+ model), bikin 6 prompt yang disesuaikan.
    const photoPrompts = await this.openAiPromptService.generatePhotoPrompts({
      productBase64,
      modelBase64,
      productName: dto.productName,
      productDescription: dto.productDescription,
      category: dto.category,
      variantCount: dto.variantCount || 6,
      background,
      hasModelImage,
    });

    this.logger.log(`[${jobId}] Got ${photoPrompts.length} prompts from OpenAI`);

    // ─── Step 3: Generate images in parallel ────────────────────────
    // Masing-masing prompt dari OpenAI → 1 variant image via Gemini → upload S3
    const variantPromises = photoPrompts.map((item, index) =>
      this.generateSingleVariant({
        jobId,
        prompt: item.prompt,
        title: item.title,
        variantNumber: index + 1,
        modelBase64,
        productBase64,
      }),
    );

    const variants: ImageVariant[] = await Promise.all(variantPromises);
    const successfulVariants = variants.filter((v) => v.imageUrl !== null).length;

    return {
      jobId,
      productName: dto.productName,
      productDescription: dto.productDescription,
      category: dto.category,
      background,
      totalVariants: variants.length,
      successfulVariants,
      failedVariants: variants.length - successfulVariants,
      variants,
      processingTime: Date.now() - startTime,
    };
  }

  // ─── Single variant ───────────────────────────────────────────────────────

  private async generateSingleVariant(params: {
    jobId: string;
    prompt: string;        // prompt dari OpenAI — siap pakai langsung
    title: string;         // scene title dari OpenAI — untuk logging
    variantNumber: number;
    modelBase64: string | null;
    productBase64: string;
  }): Promise<ImageVariant> {
    try {
      this.logger.log(`[${params.jobId}] Variant ${params.variantNumber}: "${params.title}"`);

      // Kirim ke Gemini — prompt sudah lengkap dari OpenAI
      const imageBuffer = await this.geminiImageGenService.generateImage({
        prompt: params.prompt,
        modelBase64: params.modelBase64,
        productBase64: params.productBase64,
      });

      // Upload ke S3
      const fileName = `variant_${params.variantNumber}.png`;
      const folder = `generated-images/${params.jobId}`;

      const imageUrl = await this.awsStorageService.uploadFile(
        imageBuffer,
        fileName,
        'image/png',
        folder,
      );

      this.logger.log(`[${params.jobId}] Variant ${params.variantNumber} ✓ → ${imageUrl}`);

      return {
        variantNumber: params.variantNumber,
        title: params.title,
        prompt: params.prompt,
        imageUrl,
        error: null,
        createdAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`[${params.jobId}] Variant ${params.variantNumber} ✗ — ${error.message}`);

      return {
        variantNumber: params.variantNumber,
        title: params.title,
        prompt: params.prompt,
        imageUrl: null,
        error: error.message,
        createdAt: new Date(),
      };
    }
  }

  // ─── Background resolution ────────────────────────────────────────────────

  private async resolveBackgroundFromProduct(productBase64: string): Promise<string> {
    try {
      this.logger.log('Resolving background color from product image...');

      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: productBase64,
                mimeType: 'image/png',
              },
            },
            {
              text: `Look at this product image. Based on its dominant colors and visual tone,
pick exactly ONE background that would create the best contrast and visual harmony for an e-commerce product photo.

Options:
- plain_white
- wine_red
- light_blue

Reply with ONLY the option key. No explanation.`,
            },
          ],
        },
      });

      const pick = (response.text || '').trim().toLowerCase() as BackgroundKey;

      if (pick in BACKGROUND_FALLBACKS) {
        this.logger.log(`Background resolved: ${pick}`);
        return BACKGROUND_FALLBACKS[pick];
      }

      this.logger.warn(`Unexpected background key: "${pick}", falling back to plain_white`);
      return BACKGROUND_FALLBACKS.plain_white;

    } catch (error) {
      this.logger.warn(`Background resolution failed: ${error.message}. Defaulting to plain_white.`);
      return BACKGROUND_FALLBACKS.plain_white;
    }
  }
}