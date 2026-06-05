import {
  Catch,
  HttpException,
  ExceptionFilter,
  ArgumentsHost,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from './log4j.util';

/**
 * HTTP 异常过滤器
 * @Catch(HttpException) 表示只捕获 NestJS 标准的 HttpException 及其子类（如 BadRequestException, UnauthorizedException 等）
 * 这通常用于处理业务逻辑中主动抛出的预期错误（如参数校验失败、权限不足）
 */
@Catch(HttpException)
export class HttpExceptionsFilter implements ExceptionFilter {
  /**
   * 异常处理方法
   * @param exception 捕获到的 HttpException 实例
   * @param host 参数宿主，用于获取请求和响应上下文
   */
  catch(exception: HttpException, host: ArgumentsHost) {
    // 切换到 HTTP 上下文
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 获取 HTTP 状态码 (例如 400, 401, 403, 404 等)
    const status = exception.getStatus();

    // 获取异常的响应体内容
    // exception.getResponse() 可能返回字符串，也可能返回包含 message, error 等字段的对象
    const exceptionResponse = exception.getResponse();

    // 尝试从响应对象中提取具体的错误消息字段
    const objMessage = (exceptionResponse as Record<string, unknown>).message;

    // 智能提取最终要展示给用户的错误消息字符串
    // 优先级：
    // 1. 如果响应体本身就是字符串，直接使用
    // 2. 如果响应体是对象且包含 message 字符串，使用 message
    // 3. 否则回退到 exception 默认的 message 属性
    const responseMessage: string =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : typeof objMessage === 'string'
          ? objMessage
          : exception.message;

    // 构建日志格式字符串
    // 记录请求详情以及具体的错误原因，方便排查业务逻辑问题
    const logFormat = `-----------------------------------------------------------------------
        Request original url: ${request.originalUrl}
        Method: ${request.method}
        IP: ${request.ip}
        Status code: ${status}
        Response: ${exception.toString() + `（${responseMessage}）`}
        -----------------------------------------------------------------------
        `;

    // 记录 INFO 级别日志
    // 注意：这里使用 info 而不是 error，因为 HttpException 通常是客户端引起的预期错误（如输入错误），而非服务器崩溃
    Logger.info(logFormat);

    // 向客户端发送统一的 JSON 格式错误响应
    response.status(status).json({
      code: status, // 业务状态码
      error: responseMessage, // 具体的错误详情，帮助前端提示用户
      msg: `${status >= 500 ? 'Service Error' : 'Client Error'}`, // 简短的错误类型分类
    });
  }
}
