import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { ApiSuccess } from '@shared/api';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccess<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiSuccess<T>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const traceId =
      (req.headers['x-trace-id'] as string | undefined) ||
      (req.headers['x-request-id'] as string | undefined) ||
      randomUUID();
    res.setHeader('X-Trace-Id', traceId);

    // Prometheus 指标端点需要返回原始 text/plain，跳过统一响应包装
    const requestPath = (req.baseUrl || '') + (req.path || '');
    if (requestPath === '/api/metrics') {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: T) => ({
        code: 0,
        data: data ?? (null as unknown as T),
        message: 'ok',
        traceId,
      })),
    );
  }
}
