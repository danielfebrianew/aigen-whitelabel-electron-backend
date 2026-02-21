import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsEnum, Max, Min, IsInt } from 'class-validator';

export enum ProductCategory {
  FASHION = 'fashion',             // nempel ke badan: kaos, sepatu, jam tangan, kacamata
  HANDHELD = 'handheld',           // dipegang: tumbler, vitamin, tas, buku
  FOOD_BEVERAGE = 'food_beverage', // makanan/minuman — model optional, focus ke product
}

export class GenerateImageRequestDto {
  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsString()
  @IsNotEmpty()
  productDescription: string;

  @IsEnum(ProductCategory)
  category: ProductCategory;

  @IsString()
  @IsOptional()
  background?: string;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return parseInt(value, 10);
  })
  @IsInt()
  @Min(1)
  @Max(6)
  @IsOptional()
  variantCount?: number;

  @IsOptional() 
  modelImageUrl?: string; 

  @IsOptional()
  productImageUrl?: string;
}

export interface ImageVariant {
  variantNumber: number;
  title: string;
  prompt: string;
  imageUrl: string | null;
  error: string | null;
  createdAt: Date;
}

export interface GenerateImageResponse {
  jobId: string;
  productName: string;
  productDescription: string;
  category: ProductCategory;
  background: string;
  totalVariants: number;
  successfulVariants: number;
  failedVariants: number;
  variants: ImageVariant[];
  processingTime: number;
}
