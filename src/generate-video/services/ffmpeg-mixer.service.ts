import { Injectable } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import { VideoUtilsHelper } from '../helpers/video-utils.helper';

@Injectable()
export class FfmpegMixService {
  constructor(private videoUtilsHelper: VideoUtilsHelper) {}

  async stitchVisuals(clipPaths: string[], outputPath: string): Promise<string> {
    await this.videoUtilsHelper.mergeVideoFiles(clipPaths, outputPath);
    return outputPath;
  }

  async mergeAudioVisual(videoPath: string, audioPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-c:v copy',
          '-c:a aac',
          '-map 0:v:0',
          '-map 1:a:0'
        ])
        .save(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err));
    });
  }
}