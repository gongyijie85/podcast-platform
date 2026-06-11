import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '@shared/api';

interface ErrorPayload {
  code: number;
  message: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const incomingTraceId =
      (request.headers['x-trace-id'] as string | undefined) ||
      (request.headers['x-request-id'] as string | undefined) ||
      randomUUID();
    response.setHeader('X-Trace-Id', incomingTraceId);

    const { code, message, status } = this.toErrorPayload(exception);

    if (status >= 500) {
      this.logger.error(
        `[${incomingTraceId}] ${request.method} ${request.url} → ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      code,
      data: null,
      message,
      traceId: incomingTraceId,
    });
  }

  private toErrorPayload(exception: unknown): {
    code: number;
    message: string;
    status: number;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        return { code: this.statusToCode(status), message: resp, status };
      }
      if (typeof resp === 'object' && resp !== null) {
        const r = resp as Record<string, unknown>;
        const message =
          (r.message as string) ||
          (Array.isArray(r.message) ? (r.message as string[]).join('; ') : 'Error');
        const code = typeof r.code === 'number' ? (r.code as number) : this.statusToCode(status);
        return { code, message, status };
      }
      return { code: this.statusToCode(status), message: 'Error', status };
    }

    if (exception instanceof Error) {
      return {
        code: ErrorCode.INTERNAL_ERROR,
        message: exception.message || 'Internal error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }

    return {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  private statusToCode(status: number): number {
    switch (status) {
      case 400:
        return ErrorCode.BAD_REQUEST;
      case 401:
        return ErrorCode.UNAUTHORIZED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 429:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
