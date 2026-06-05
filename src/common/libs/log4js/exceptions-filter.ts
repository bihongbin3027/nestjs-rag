import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { Logger } from './log4j.util';

/**
 * 全局异常过滤器
 * @Catch() 不带参数表示捕获所有类型的异常（包括未处理的运行时错误）
 */
@Catch()
export class ExceptionsFilter implements ExceptionFilter {
  /**
   * 异常处理方法
   * @param exception 捕获到的异常对象
   * @param host 参数宿主，用于获取请求和响应上下文
   */
  catch(exception: unknown, host: ArgumentsHost) {
    // 切换到 HTTP 上下文，以便访问 Express 的 request 和 response 对象
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 判断异常类型并确定 HTTP 状态码
    // 如果是 NestJS 标准的 HttpException，则获取其自带状态码；否则默认为 500 (Internal Server Error)
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 构建详细的错误日志格式
    // 包含：请求 URL、方法、IP、状态码以及异常的具体信息
    const logFormat = `-----------------------------------------------------------------------
      Request original url: ${request.originalUrl}
      Method: ${request.method}
      IP: ${request.ip}
      Status code: ${status}
      Response: ${String(exception)}
      -----------------------------------------------------------------------
      `;

    // 记录 ERROR 级别日志，便于后续排查问题
    Logger.error(logFormat);

    // 向客户端发送统一的 JSON 格式错误响应
    response.status(status).json({
      code: status, // 业务状态码，通常与 HTTP 状态码保持一致
      msg: `Service Error: ${String(exception)}`, // 错误消息提示
    });
  }
}
