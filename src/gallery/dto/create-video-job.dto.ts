export class CreateVideoJobDto {
  jobId: string;
  productName: string;
  script: string;
  voiceGender: string;
  promptCount: number;
  targetCount: number;
  prompts: string[];
  inputImages: string[];
  thumbnailUrl: string;
  videos: {
    variationNumber: number;
    videoUrl: string;
    fileName: string;
  }[];
}