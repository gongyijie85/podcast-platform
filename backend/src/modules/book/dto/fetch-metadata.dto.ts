import { IsArray, ArrayMaxSize, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class FetchMetadataDto {
  @IsString({ each: true })
  @IsArray()
  @ArrayMaxSize(20)
  @Transform(({ value }) =>
    Array.isArray(value) ? value : String(value).split(/[\s,;\n]+/).filter(Boolean),
  )
  isbns!: string[];

  @IsString()
  projectId!: string;
}
