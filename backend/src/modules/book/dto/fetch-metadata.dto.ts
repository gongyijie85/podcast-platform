import { IsArray, ArrayMaxSize, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
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

export class ResolveMetadataDto {
  @IsString({ each: true })
  @IsArray()
  @ArrayMaxSize(20)
  @Transform(({ value }) =>
    Array.isArray(value) ? value : String(value).split(/[\s,;\n]+/).filter(Boolean),
  )
  isbns!: string[];
}

export class BookRankImportDto {
  @IsIn(['bestsellers', 'new-books'])
  kind!: 'bestsellers' | 'new-books';

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
