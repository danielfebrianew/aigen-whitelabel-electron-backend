import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ProductCategory } from '../dto/generate-image.dto';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PhotoPromptItem {
    title: string;
    prompt: string;
}

export interface GeneratePhotoPromptsParams {
    productBase64: string;
    modelBase64: string | null;
    productName: string;
    productDescription: string;
    category: ProductCategory;
    variantCount: number;
    background: string;
    hasModelImage: boolean;
}

// ─── Category Instructions ─────────────────────────────────────────────────

const CATEGORY_INSTRUCTIONS: Record<ProductCategory, string> = {
    [ProductCategory.FASHION]: `
- The model MUST be WEARING the product. The garment or accessory must look natural on the body.
- Each prompt should show a different outfit styling or angle that highlights the product.
- Focus on fit, fabric texture, and how the product moves with the body.`,

    [ProductCategory.HANDHELD]: `
- The model MUST be HOLDING or INTERACTING with the product naturally.
- Vary the interaction: holding, placing down, picking up, looking at, using.
- The product must be prominently visible — never fully hidden by hands.`,

    [ProductCategory.FOOD_BEVERAGE]: `
- The product is the HERO. It must dominate the composition.
- Some shots can be product-only (no person). Others can have a hand reaching, holding, or pouring.
- Focus on texture, color, steam, liquid splash, or appetite-appeal details.
- Use food photography techniques: hero angle, steam, macro detail, lifestyle context.`,
};

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class OpenAiPromptService {
    private readonly logger = new Logger(OpenAiPromptService.name);
    private readonly openai: OpenAI;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (!apiKey) throw new Error('OPENAI_API_KEY is missing');
        this.openai = new OpenAI({ apiKey });
    }

    async generatePhotoPrompts(params: GeneratePhotoPromptsParams): Promise<PhotoPromptItem[]> {
        try {
            this.logger.log(`Generating photo prompts via OpenAI for "${params.productName}" [${params.category}]`);

            // ─── Image blocks ─────────────────────────────────────────────
            const imageBlocks: OpenAI.Chat.ChatCompletionContentPart[] = [];

            // Product image — selalu ada. Label explicitly supaya GPT-4o tau mana yang mana.
            imageBlocks.push({
                type: 'text',
                text: 'The following image is the PRODUCT reference:',
            });
            imageBlocks.push({
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${params.productBase64}` },
            });

            // Model image — optional
            if (params.modelBase64) {
                imageBlocks.push({
                    type: 'text',
                    text: 'The following image is the MODEL reference:',
                });
                imageBlocks.push({
                    type: 'image_url',
                    image_url: { url: `data:image/png;base64,${params.modelBase64}` },
                });
            }

            // ─── Prompt text ──────────────────────────────────────────────
            const categoryInstruction = CATEGORY_INSTRUCTIONS[params.category];

            const modelInstruction = params.hasModelImage
                ? `- A model reference image IS provided. Every prompt that includes a person MUST describe
them with physical traits that EXACTLY match the reference (skin tone, hair, build, features).
Do NOT invent or change the model's appearance.`
                : `- No model reference image was provided. For prompts that include a person, describe
a generic, attractive model appropriate for the product category. Keep the description
consistent across all 6 prompts (same person across the set).`;

            const promptText = `You are a professional Creative Director for a high-end AI Photography Studio.

STEP 1 — ANALYZE:
- Look at the PRODUCT reference image. Describe in detail: exact colors, material, shape, logos, stitching, any unique visual details.
- ${params.hasModelImage ? 'Look at the MODEL reference image. Note: skin tone, hair color/style, facial features, build.' : ''}

STEP 2 — GENERATE:
Generate exactly ${params.variantCount} distinct, high-quality creative prompts for advertising photography.
Each prompt will be sent to a separate image generation AI that CANNOT see the reference images — so your text description of the product must be detailed enough to recreate it visually.

CONTEXT:
- Product name: "${params.productName}"
- Product description: "${params.productDescription}"
- Category: ${params.category}
- Background: ${params.background}

RULES:
${modelInstruction}
- FIRST describe the product visually based on what you see in the image, THEN build the scene around it. Use specific details (e.g., "dark navy canvas jacket with brass zipper and stitched collar") — NOT generic terms.
- Each prompt must use a DIFFERENT camera angle or composition (close-up, wide-shot, low-angle, overhead, three-quarter, macro).
- Each prompt must specify lighting style (soft studio, golden hour, Rembrandt, neon accent, flat lay natural light).
- Background in all prompts: ${params.background}.
- Style: Photorealistic, high-end commercial, e-commerce quality. NO cartoon, NO illustration.
${categoryInstruction}

STEP 3 — OUTPUT:
Return a JSON object in this exact shape — do NOT return a raw array, wrap it in an object:
{
  "prompts": [
    { "title": "2-3 word scene title", "prompt": "Full 50-80 word prompt." },
  ]
    Array must contain exactly ${params.variantCount} items.
}`;

            // ─── Call GPT-4o ───────────────────────────────────────────────
            // TIDAK pakai response_format: json_object — itu yang bikin content null
            // waktu dikasih base64 images. Kita extract JSON dari plain text response.
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            ...imageBlocks,
                            { type: 'text', text: promptText },
                        ],
                    },
                ],
            });

            // ─── Log raw response untuk debugging ─────────────────────────
            const choice = response.choices[0];
            this.logger.log(`OpenAI finish_reason: ${choice?.finish_reason}`);
            this.logger.log(`OpenAI raw content (first 500 chars): ${choice?.message?.content?.substring(0, 500)}`);

            const content = choice?.message?.content;
            if (!content) {
                throw new Error(`OpenAI returned empty content. finish_reason: ${choice?.finish_reason}`);
            }

            // ─── Extract JSON dari plain text ─────────────────────────────
            // GPT-4o kadang wrap response di markdown code block: ```json ... ```
            // atau langsung plain JSON. Handle kedua case.
            const jsonString = this.extractJson(content);
            if (!jsonString) {
                throw new Error(`Could not find valid JSON in OpenAI response. Raw: ${content.substring(0, 300)}`);
            }

            const parsed = JSON.parse(jsonString);

            // Resolve array — bisa di dalam { "prompts": [...] } atau langsung array
            const prompts: PhotoPromptItem[] = Array.isArray(parsed)
                ? parsed
                : parsed.prompts || parsed.photoPrompts || parsed.results || Object.values(parsed)[0];

            if (!Array.isArray(prompts) || prompts.length === 0) {
                throw new Error('Parsed JSON does not contain a valid prompts array');
            }

            const result = prompts.slice(0, params.variantCount);
            this.logger.log(`Got ${result.length} photo prompts from OpenAI`);
            return result;

        } catch (error) {
            this.logger.error(`OpenAI prompt generation failed: ${error.message}`);
            throw new InternalServerErrorException(`OpenAI Error: ${error.message}`);
        }
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    /**
     * Cari JSON di dalam plain text.
     * Handle: ```json ... ``` | { ... } | [ ... ]
     */
    private extractJson(text: string): string | null {
        // Case 1: wrapped di markdown code block
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) return codeBlockMatch[1].trim();

        // Case 2: cari object atau array JSON langsung
        // Cari dari { atau [ pertama sampai akhir
        const objectStart = text.indexOf('{');
        const arrayStart = text.indexOf('[');

        if (objectStart === -1 && arrayStart === -1) return null;

        // Ambil yang mana yang lebih awal
        const start = objectStart === -1 ? arrayStart
            : arrayStart === -1 ? objectStart
                : Math.min(objectStart, arrayStart);

        const candidate = text.substring(start);

        // Validate — coba parse, kalau fail coba trim dari belakang
        try {
            JSON.parse(candidate);
            return candidate;
        } catch {
            // Mungkin ada trailing text setelah JSON. Coba cari closing bracket.
            const closingChar = candidate[0] === '{' ? '}' : ']';
            const lastClose = candidate.lastIndexOf(closingChar);
            if (lastClose === -1) return null;

            const trimmed = candidate.substring(0, lastClose + 1);
            try {
                JSON.parse(trimmed);
                return trimmed;
            } catch {
                return null;
            }
        }
    }
}