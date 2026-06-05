import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Logger } from './log4j.util';

/**
 * 全局响应转换拦截器
 * 主要作用：
 * 1. 统一处理响应后的日志记录（包括请求信息和响应数据）
 * 2. 可以在这里对响应数据进行统一的格式包装（虽然当前代码主要侧重日志，但结构上支持数据转换）
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  /**
   * 拦截方法
   * @param context 执行上下文，包含请求、响应等信息
   * @param next 调用处理器，用于执行后续的控制器方法或下一个拦截器
   * @returns 返回一个 Observable，代表最终的响应流
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {
    // 获取 HTTP 请求对象
    // 注意：req.user 通常由认证中间件（如 Passport）在之前的步骤中挂载
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: Record<string, any> }>();

    // 使用 RxJS 的 map 操作符拦截响应流
    // 当控制器方法执行完毕并返回数据后，会进入这个 map 函数
    return next.handle().pipe(
      map((data: Record<string, any>) => {
        // 构建详细的日志格式字符串
        // 包含：原始 URL、HTTP 方法、客户端 IP、当前用户信息、响应数据主体
        const logFormat = `-----------------------------------------------------------------------
        Request original url: ${req.originalUrl}
        Method: ${req.method}
        IP: ${req.ip}
        User: ${JSON.stringify(req.user)}
        Response data: ${JSON.stringify(data.data)}
        -----------------------------------------------------------------------`;

        // 记录 INFO 级别日志：用于常规的控制台输出和 app.log 文件
        Logger.info(logFormat);

        // 记录 ACCESS 级别日志：专门用于 HTTP 访问日志统计，通常写入 access.log
        Logger.access(logFormat);

        // 返回原始数据（或者可以在这里对 data 进行统一包装，例如 { code: 200, data: data }）
        // 当前实现是直接透传控制器返回的数据
        return data;
      }),
    );
  }
}
