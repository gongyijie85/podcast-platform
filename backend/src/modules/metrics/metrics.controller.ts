import { Controller } from '@nestjs/common';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { Public } from '../auth/public.decorator';

/**
 * 自定义 Prometheus 指标控制器
 * 继承库的默认控制器，并用 @Public() 绕过全局 JWT 认证，
 * 使 /api/metrics 可被 Prometheus 直接抓取。
 */
@Public()
@Controller()
export class MetricsController extends PrometheusController {}
