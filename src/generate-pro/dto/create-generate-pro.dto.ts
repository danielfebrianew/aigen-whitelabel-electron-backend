import { IsNotEmpty, IsString } from 'class-validator';

export class CreateGenerateProDto {
  @IsString()
  @IsNotEmpty()
  productTitle: string;

  @IsString()
  @IsNotEmpty()
  productDescription: string;

  @IsString()
  @IsNotEmpty()
  jobId: string;
}
