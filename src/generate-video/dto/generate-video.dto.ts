import { IsArray, IsNotEmpty, IsString, IsUrl, IsInt, Min, Max, IsOptional, ArrayMinSize, IsNumber, IsIn } from 'class-validator';

export class GenerateTextDto {
  @IsNotEmpty()
  @IsUrl({}, { message: 'Image URL tidak valid' })
  imageUrl: string;

  @IsOptional() 
  @IsInt()
  @Min(4, { message: 'Minimal 4 prompt' })
  @Max(6, { message: 'Maksimal 6 prompt' })
  promptCount: number; 

  @IsNotEmpty()
  productName: string;
}

export class GenerateVideoDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Minimal harus ada 1 gambar." })
  @IsUrl({}, { each: true, message: "Setiap item dalam images harus berupa URL valid." })
  images: string[]; 

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  prompts: string[]; 

  @IsString()
  @IsNotEmpty()
  script: string;

  @IsString()
  @IsNotEmpty()
  jobId: string;

  @IsNumber()
  targetCount: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(['male', 'female'])
  voiceGender: string;
}