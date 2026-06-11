import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ErrorCode } from '@shared/api';

@Injectable()
export class CustomValidationPipe implements PipeTransform<unknown> {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (!metadata.metatype || this.isPrimitive(metadata.metatype)) return value;
    const object = plainToInstance(metadata.metatype as new () => object, value, {
      enableImplicitConversion: true,
    });
    const errors = await validate(object as object);
    if (errors.length > 0) {
      const messages = errors
        .map((e) => Object.values(e.constraints || {}).join(', '))
        .filter(Boolean);
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: messages.join('; ') || 'Validation failed',
      });
    }
    return object;
  }

  private isPrimitive(metatype: unknown): boolean {
    const types: unknown[] = [String, Boolean, Number, Array, Object];
    return types.includes(metatype);
  }
}
