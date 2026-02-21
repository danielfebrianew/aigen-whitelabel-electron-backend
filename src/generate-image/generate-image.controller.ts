// generate-image.controller.ts
import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { GenerateImageService } from './generate-image.service';
import { GenerateImageRequestDto } from './dto/generate-image.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator'; // adjust path
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';

@Controller('generate-image')
@UseInterceptors(ResponseInterceptor)
export class GenerateImageController {
  private readonly logger = new Logger(GenerateImageController.name);

  constructor(private readonly generateImageService: GenerateImageService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED) // 201
  @ResponseMessage('Berhasil generate gambar produk')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'modelImage', maxCount: 1 },
      { name: 'productImage', maxCount: 1 },
    ]),
  )
  async generateImages(
    @UploadedFiles()
    files: {
      modelImage?: Express.Multer.File[];
      productImage?: Express.Multer.File[];
    },
    @Body() body: GenerateImageRequestDto,
  ) {
    if (!files?.productImage?.[0]) {
      throw new BadRequestException('productImage is required.');
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
    const productFile = files.productImage[0];
    const modelFile = files.modelImage?.[0] || null;

    if (!allowedTypes.includes(productFile.mimetype)) {
      throw new BadRequestException('Invalid file type for productImage.');
    }
    if (modelFile && !allowedTypes.includes(modelFile.mimetype)) {
      throw new BadRequestException('Invalid file type for modelImage.');
    }

    return await this.generateImageService.generateImage(
      body,
      { modelImage: modelFile, productImage: productFile },
    );
  }
}