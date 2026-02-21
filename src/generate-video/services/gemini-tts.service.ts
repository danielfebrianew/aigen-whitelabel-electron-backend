import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { VideoUtilsHelper } from '../helpers/video-utils.helper';

@Injectable()
export class GeminiTtsService {
  private gemini: GoogleGenAI;

  constructor(
    private configService: ConfigService,
    private videoUtilsHelper: VideoUtilsHelper
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
    
    this.gemini = new GoogleGenAI({ apiKey });
  }

  async generateAudio(textScript: string, outputDir: string, voiceName: string): Promise<string> {
    const response = await this.gemini.models.generateContentStream({
      model: 'gemini-2.5-flash-preview-tts',
      config: {
        responseModalities: ['audio'] as any,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName,
            },
          },
        },
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: textScript }],
        },
      ],
    });

    const outputFileName = path.join(outputDir, `audio_${Date.now()}.wav`);
    let audioCreated = false;

    for await (const chunk of response) {
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        const { data, mimeType } = chunk.candidates[0].content.parts[0].inlineData;
        const buffer = this.videoUtilsHelper.convertToWav(data || '', mimeType || '');
        
        await fs.promises.writeFile(outputFileName, buffer);
        audioCreated = true;
        return outputFileName;
      }
    }

    if (!audioCreated) {
      throw new Error("Gemini stream finished without audio data.");
    }

    return outputFileName;
  }
}