import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';

@Injectable()
export class AwsStorageService {
  private readonly logger = new Logger(AwsStorageService.name);
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const bucket = this.configService.get<string>('AWS_BUCKET_NAME');

    if (!region || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error('AWS S3 Configuration is missing in .env file');
    }

    this.bucketName = bucket;

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(fileInput: string | Buffer, fileName: string, contentType: string, folder: string = ''): Promise<string> {
    try {
      let body: Buffer;
      if (typeof fileInput === 'string') {
        if (!fs.existsSync(fileInput)) {
            throw new Error(`File not found at path: ${fileInput}`);
        }
        body = fs.readFileSync(fileInput);
      } else {
        body = fileInput;
      }

      const key = folder ? `${folder}/${fileName}` : fileName;

      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read',
      }));

      const region = this.configService.get<string>('AWS_REGION');
      return `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;

    } catch (error) {
      this.logger.error(`S3 Upload Error: ${error.message}`);
      throw new InternalServerErrorException(`S3 Upload Failed: ${error.message}`);
    }
  }
}