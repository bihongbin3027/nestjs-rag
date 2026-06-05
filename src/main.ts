import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import Chalk from 'chalk';
import helmet from 'helmet';
import { mw as requestIpMw } from 'request-ip';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { logger } from './common/libs/log4js/logger.middleware';
import { Logger } from './common/libs/log4js/log4j.util';
import { TransformInterceptor } from './common/libs/log4js/transform.interceptor';
import { HttpExceptionsFilter } from './common/libs/log4js/http-exceptions-filter';
import { ExceptionsFilter } from './common/libs/log4js/exceptions-filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 启用跨域资源共享
    cors: {
      // 只允许特定域名
      origin: ['http://localhost:3000'],
      // 允许的 HTTP 方法
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      // 是否允许发送 Cookie/认证信息
      credentials: true,
      // 允许的请求头
      allowedHeaders: 'Content-Type, Authorization',
    },
  });
  // 加载进程环境变量包的 Nest 配置模块
  const config = app.get<ConfigService>(ConfigService);
  // 获取配置端口并启动服务
  const port = config.get<number>('app.port') || 8080;

  // 设置 api 访问前缀
  const prefix = config.get<string>('app.prefix', '/api');
  app.setGlobalPrefix(prefix);

  // web 安全，防常见漏洞
  // 注意： 开发环境如果开启 nest static module 需要将 crossOriginResourcePolicy 设置为 false 否则 静态资源 跨域不可访问
  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: false,
    }),
  );

  // 设置api访问频率
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 100, // 限制15分钟内最多只能访问1000次
    }),
  );

  // 获取真实 ip
  app.use(requestIpMw({ attributeName: 'ip' }));

  // 解析 json 格式的请求体
  app.use(express.json());
  // 解析 urlencoded 格式的请求体(extended: true 的含义-比如表单提交user[name]=john&user[age]=30 会被解析为 { user: { name: 'john', age: 30 } })
  app.use(express.urlencoded({ extended: true }));
  // 日志-输出 api请求和响应日志
  app.use(logger);

  // 全局拦截器打印出参
  app.useGlobalInterceptors(new TransformInterceptor());

  // 全局异常过滤器捕获未处理的异常并记录日志（捕获所有其他异常（兜底过滤器））
  // 场景：这些是未处理的异常，例如：
  // *数据库连接错误
  // *文件读取错误
  // *网络错误
  // *其他未处理的异常
  app.useGlobalFilters(new ExceptionsFilter());
  // 全局 HTTP 异常过滤器（只捕获 HttpException 及其子类）
  // 场景：这些是预期内的业务错误。例如：
  // *用户登录密码错误 (401 Unauthorized)
  // *参数校验失败 (400 Bad Request)
  // *权限不足 (403 Forbidden)
  // *资源未找到 (404 Not Found)
  app.useGlobalFilters(new HttpExceptionsFilter());

  const swaggerOptions = new DocumentBuilder()
    .setTitle('App')
    .setDescription('App 接口文档')
    .setVersion('2.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerOptions);
  // 项目依赖当前文档功能，最好不要改变当前地址
  // 生产环境使用 nginx 可以将当前文档地址 屏蔽外部访问
  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'API Docs',
  });

  await app.listen(port);

  Logger.log(
    Chalk.green(`服务启动成功 `),
    `http://localhost:${port}${prefix}/`,
    '\n',
    Chalk.green('swagger 文档地址        '),
    `http://localhost:${port}${prefix}/docs/`,
  );
}

void bootstrap();
