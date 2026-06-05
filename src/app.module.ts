import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';

import path from 'path';

// 导入自定义配置加载函数
import configuration from './config/index';

// 导入全局安全守卫：JWT认证守卫和角色权限守卫
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

// 导入业务功能模块
import { UserModule } from './system/user/user.module';
import { PermModule } from './system/perm/perm.module';

@Module({
  imports: [
    // 配置模块：全局可用，启用缓存，加载自定义配置
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [configuration],
    }),

    // 数据库模块
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql' as const,
        host: config.get<string>('db.mysql.host'),
        port: config.get<number>('db.mysql.port'),
        username: config.get<string>('db.mysql.username'),
        password: config.get<string>('db.mysql.password'),
        database: config.get<string>('db.mysql.database'),
        charset: config.get<string>('db.mysql.charset'),
        synchronize: config.get<boolean>('db.mysql.synchronize'),
        logging: config.get<boolean>('db.mysql.logging'),
        autoLoadEntities: true,
      }),
    }),

    // 静态文件服务模块：用于提供上传文件的访问服务
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          // 设置静态文件的根目录路径，指向项目根目录下的 upload 文件夹
          rootPath: path.join(__dirname, '../../', 'upload'),
          // 排除特定的 API 前缀路径，避免与接口路由冲突
          exclude: [`${config.get('app.prefix')}`],
          // 设置静态资源的访问根路径（例如 /uploads）
          serveRoot: config.get('app.file.serveRoot'),
          // 静态服务选项：启用浏览器缓存控制
          serveStaticOptions: {
            cacheControl: true,
          },
        },
      ],
    }),

    // 基础系统模块：用户管理模块
    UserModule,
    // 基础系统模块：权限管理模块
    PermModule,
  ],
  providers: [
    // 注册全局 JWT 认证守卫，所有请求默认需要验证 Token
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 注册全局角色权限守卫，用于验证用户是否具备访问特定资源的角色权限
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
