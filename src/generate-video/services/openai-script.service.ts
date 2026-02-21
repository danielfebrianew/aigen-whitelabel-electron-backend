import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAiScriptService {
  private readonly logger = new Logger(OpenAiScriptService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
    this.openai = new OpenAI({ apiKey });
  }

  async analyzeImageAndCreateScript(imageUrl: string, count: number, productName: string) {
    let durationPrompt = "Target ≈20 seconds";

    switch (count) {
      case 4:
        durationPrompt = "Target ≈20 seconds (±45-50 words)";
        break;
      case 5:
        durationPrompt = "Target ≈25 seconds (±50-55 words)";
        break;
      case 6:
        durationPrompt = "Target ≈30 seconds (±55-60 words)";
        break;
      default:
        throw new InternalServerErrorException('Count must be 4, 5, or 6');
    }

    const promptText = `
      Analyze this image thoroughly.
      Name of the product is "${productName}".
      
      Task: Create a JSON output containing script, prompts, and CAPTION COMPONENTS.
      
      1. "voiceover": Naskah voiceover PADAT & JELAS (Bahasa Indonesia). Durasi: ${durationPrompt}. Gaya: Storytelling/Review jujur ke sahabat. Akhiri dengan ajakan cek keranjang kuning.
      
      2. "captionComponents": Buatkan komponen caption dalam Bahasa Indonesia (Singkat & Menarik) untuk dirakit secara acak nanti:
         - "hooks": 5 variasi headline clickbait/pertanyaan (Max 1 kalimat).
         - "bodies": 5 variasi body text menjelaskan keunggulan/manfaat produk "${productName}" dengan angle berbeda.
         - "ctas": 5 variasi kalimat ajakan pendek (Contoh: "Cek keranjang kuning!", "Buruan checkout!").
         - "hashtags": 4 set hashtags (tiap set isi 3-4 tag relevan).

      3. "videoPrompts": Array of ${count} distinct English visual prompts. Each must use different camera angles (Close Up, Pan, Zoom, etc). Focus on aesthetics.

      FORMAT JSON ONLY:
      {
        "voiceover": "...",
        "captionComponents": {
            "hooks": ["...", ...],
            "bodies": ["...", ...],
            "ctas": ["...", ...],
            "hashtags": ["...", ...]
        },
        "videoPrompts": [...]
      }
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error('OpenAI returned empty content');

      const parsedData = JSON.parse(content);

      return {
        voiceover: parsedData.voiceover,
        videoPrompts: parsedData.videoPrompts,
        captionComponents: parsedData.captionComponents 
      };

    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('OpenAI Error: ' + error.message);
    }
  }
}