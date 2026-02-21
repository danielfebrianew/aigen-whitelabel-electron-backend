import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class AwsStorageService {
  private readonly logger = new Logger(AwsStorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(private configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') || '';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID') || '';
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '';
    this.bucketName = this.configService.get<string>('AWS_BUCKET_NAME') || '';

    if (!this.region || !accessKeyId || !secretAccessKey || !this.bucketName) {
      throw new Error('AWS S3 Configuration is missing in .env file');
    }

    this.s3Client = new S3Client({
      region: this.region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async uploadFile(
    buffer: Buffer,
    fileName: string,
    contentType: string,
    folder: string = '',
  ): Promise<string> {
    const key = folder ? `${folder}/${fileName}` : fileName;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ACL: 'public-read',
        }),
      );

      return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
    } catch (error) {
      this.logger.error(`S3 Upload Error [${key}]: ${error.message}`);
      throw new InternalServerErrorException(`S3 Upload Failed: ${error.message}`);
    }
  }
}