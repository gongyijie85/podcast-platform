import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Counter, Histogram } from 'prom-client';
import type { Request, Response } from 'express';

/**
 * HTTP 请求总数计数器
 * label：method（HTTP 方法）、path（请求路径）、status（响应状态码）
 */
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

/**
 * HTTP 请求耗时直方图
 * label：method、path、status
 */
const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/**
 * 全局 HTTP 指标拦截器
 * 在每个请求结束时记录总数与耗时，标签包含方法、路径和状态码。
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const method = req.method;
    // 使用 baseUrl + path 还原路由模板，避免静态资源路径爆炸
    const path = (req.baseUrl || '') + (req.path || req.route?.path || '/');
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const status = String(res.statusCode || 200);
        const duration =
          Number(process.hrtime.bigint() - start) / 1_000_000_000;

        httpRequestsTotal.inc({ method, path, status });
        httpRequestDurationSeconds.observe({ method, path, status }, duration);
      }),
    );
  }
}
