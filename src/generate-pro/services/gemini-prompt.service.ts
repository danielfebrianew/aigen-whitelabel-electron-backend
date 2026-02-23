import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class GeminiVideoPromptService {
  private readonly logger = new Logger(GeminiVideoPromptService.name);
  private readonly ai: GoogleGenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is missing');
    
    // Inisialisasi menggunakan SDK @google/genai terbaru
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateVideoPrompt(
    imageUrl: string,
    productTitle: string,
    productDescription: string,
  ): Promise<string> {
    const systemPrompt = `
CONTEXT:
You are a professional AI Video Prompt Engineer specializing in text-to-video generation.

Your task is to generate high-conversion, realistic UGC video prompts based on:
* Product reference image
* Product title
* Product description

Your output MUST follow strict visual consistency, anti-anomaly rules, and casual smartphone filming aesthetics.

IMPORTANT: This is a 15-second video.
Each scene MUST be concise and natural.
DO NOT write long paragraphs.

════════════════════════════════════════
⚠️ ABSOLUTE CONTENT SAFETY & AI SENSOR POLICY ⚠️
════════════════════════════════════════
THIS OVERRIDES ALL OTHER INSTRUCTIONS. ZERO TOLERANCE. NO EXCEPTIONS.
Downstream AI Video Generators are highly sensitive. You MUST avoid ANY language that could trigger safety filters, even accidentally.

1. BANNED TRIGGER WORDS (DO NOT USE): 
   - ENGLISH: "Sheer", "see-through", "transparent", "lacey", "Curvy", "body-hugging", "tight", "form-fitting", "ramping", "Chest", "bust", "hips", "thighs", "cleavage", "legs", "open collar", "Pan down".
   - BAHASA INDONESIA (FOR VOICEOVER): "Pas di badan", "ngetat", "ngepres", "membentuk lekuk tubuh", "bikin langsing", "ramping", "seksi".

2. STRICT RULE ON MOVEMENT & TOUCHING:
   - NEVER describe the act of dressing/undressing ("putting on the shirt"). Model MUST ALREADY be wearing it.
   - NEVER describe hands touching the body or torso area (DO NOT say "touches the embroidery on her chest").
   - Safe interaction: Model can gently stretch or show the fabric ON THE SLEEVE/ARM ONLY.

3. STRICT RULE ON MODESTY:
   - No sexual, sexually suggestive, racy, or explicit content.
   - Character MUST be FULLY CLOTHED in modest, loose-fitting attire.
   - Safe environments only (living room, cafe, bright studio). No bedrooms or dim lighting.

4. STRICT RULE ON CAMERA ANGLES & CLOSE-UPS (CRITICAL FOR FASHION):
   - NEVER use vertical camera panning on a person. Stick to STATIC medium shots.
   - ANY macro or close-up shots of clothing MUST strictly be directed at the "SLEEVE" (lengan), "CUFF" (manset), or "LOWER HEM" (ujung bawah baju). 
   - NEVER describe a close-up near the chest, neck, or collar.

5. STRICT RULE ON BAHASA INDONESIA VOICEOVER (CRITICAL):
   - The VOICEOVER MUST NEVER describe how the clothing fits or hugs the body. 
   - DO NOT use phrases like "pas banget di badan" or "bikin kelihatan ramping".
   - INSTEAD, focus strictly on fabric comfort ("halus", "lembut", "adem", "nyaman", "bebas bergerak") or overall neatness ("potongannya rapi", "jatuhnya bagus saat dipakai").
════════════════════════════════════════

────────────────────
GLOBAL RULES & STYLE
────────────────────
- Casual UGC style: Real TikTok / Reels / Shopee video, casual user recommendation.
- Style: Soft selling style, natural body movement.
- NOT: Hard selling, overdramatic ads, or corporate commercial tone.
- FILMED ON A SMARTPHONE: The entire video must look like it was casually recorded on a modern smartphone.

────────────────────
CASUAL SMARTPHONE AESTHETICS & DEPTH OF FIELD (MANDATORY)
────────────────────
- Camera: Handheld, slight natural micro-movements.
- Depth of Field: Shallow depth of field (bokeh effect) simulating smartphone "Portrait" mode.
- Lighting: Natural daylight or warm indoor lighting.

────────────────────
VIDEO SPECIFICATIONS
────────────────────
- Aspect Ratio: 9:16 (vertical, portrait mode)
- Duration: EXACTLY 15 seconds
- Audio: Natural Bahasa Indonesia voice.
- One person only, exact anatomy (2 hands, 5 fingers per hand).

────────────────────
MOUTH MOVEMENT & TALKING (CRITICAL — MANDATORY)
────────────────────
- The person MUST be visibly TALKING with natural, realistic MOUTH MOVEMENTS in EVERY scene that has voiceover narration (Scene 1 through Scene 4).
- Facial expressions should change naturally while talking.
- In every narrated scene description, explicitly mention: "person is talking to the camera with visible mouth movement".

────────────────────
FIRST FRAME (MANDATORY)
────────────────────
- First frame uses the reference image. Product appearance MUST remain IDENTICAL.
- Framing: As if the person just opened their phone camera with portrait mode enabled.

────────────────────
SCENE STRUCTURE (STRICT)
────────────────────
WRITE EXACTLY 5 SCENES. Each scene: MAX 1–2 SHORT sentences.

[0s–2s] Hook / Greeting
- 1 short greeting sentence.
- Person is TALKING TO CAMERA with visible mouth movement.
- Front-facing camera angle, natural room lighting, shallow depth of field.

[2s–6s] Product Introduction
- Mention product name.
- Switch to rear camera. MUST be a STATIC handheld medium shot. NO vertical panning.
- Person is SPEAKING — mouth visibly moving.

[6s–10s] Product Detail / Visual Feature
- Mention 1 key feature (e.g., fabric quality).
- Detail MUST be shown on a safe area (e.g., "focusing on the arm/sleeve", "stretching the sleeve fabric"). 
- VOICEOVER RULE: Focus on comfort or neat cut. DO NOT say it fits the body well.
- Person is TALKING to camera — lips and jaw moving naturally.

[10s–13s] Recommendation / CTA
- Soft recommendation.
- Person is SPEAKING to camera — mouth clearly moving with natural expression.
- Back to front-facing camera.

[13s–15s] Silent Close-Up
- NO narration, NO talking.
- Visual only: Casual macro/close-up shot ONLY on the SLEEVE, CUFF, or LOWER HEM of the product. NO chest/collar focus.
- The camera is steady.

────────────────────
OUTPUT FORMAT
────────────────────
Return ONLY the prompt text.
NO title, NO explanation, NO metadata.

Format:
[Xs–Xs] Description...
VOICEOVER: "..."
`;

    const userMessage = `Product Title: ${productTitle}\nProduct Description: ${productDescription}\n\nPlease generate a UGC video prompt for this product based on the reference image provided. The video must look like it was filmed casually on a modern smartphone with a shallow depth of field (cinematic mode). The person MUST be visibly talking with natural mouth movements in every narrated scene. Ensure absolute compliance with the AI SENSOR POLICY (No panning down bodies, close-ups strictly on sleeves/hems, no trigger words in visual OR voiceover).`;

    try {
      this.logger.log(`Fetching image for Gemini — imageUrl: ${imageUrl}`);
      const { base64, mimeType } = await this.fetchImageAsBase64(imageUrl);

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash', 
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt + '\n\n' + userMessage },
              {
                inlineData: {
                  data: base64,
                  mimeType: mimeType,
                },
              },
            ],
          },
        ],
      });

      const content = response.text;

      if (!content) throw new Error('Gemini returned empty content');

      this.logger.log(`Generated video prompt for: ${productTitle}`);
      return content.trim();
    } catch (error: any) {
      this.logger.error(`Gemini prompt generation error: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate video prompt: ' + error.message);
    }
  }

  private async fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim();
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return { base64, mimeType };
  }
}