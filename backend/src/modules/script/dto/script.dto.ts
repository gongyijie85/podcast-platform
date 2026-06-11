import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ScriptSegmentInput {
  @IsString()
  speaker!: 'host' | 'guest';

  @IsString()
  text!: string;

  @IsString()
  emotion!: string;

  @IsString()
  stage!: string;

  @IsOptional()
  @IsString()
  id?: string;
}

export class SaveScriptDto {
  @IsString()
  content!: string;

  @IsString()
  rawText!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScriptSegmentInput)
  segments!: ScriptSegmentInput[];
}
