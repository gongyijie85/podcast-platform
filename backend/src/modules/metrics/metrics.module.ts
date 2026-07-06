import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';

/**
 * 监控指标模块
 * 通过 @willsoto/nestjs-prometheus 暴露 /api/metrics 端点，
 * 供 Prometheus 抓取核心 HTTP 与队列指标。
 */
@Module({
  imports: [
    PrometheusModule.register({
      // 全局前缀已经是 /api，这里用 /metrics 才能合成 /api/metrics
      path: '/metrics',
      controller: MetricsController,
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
})
export class MetricsModule {}
