import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import {
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { ALLOW_ANON } from '../decorators/allow-anon.decorator';
import { UserService } from '../../system/user/user.service';

/**
 * JWT 认证守卫
 *
 * 该守卫用于保护路由，确保只有携带有效 JWT Token 的请求才能访问。
 * 它扩展了 NestJS Passport 的 AuthGuard，并集成了自定义的匿名访问检查逻辑。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    @Inject(UserService)
    private readonly userService: UserService,
  ) {
    super();
  }

  /**
   * 判断请求是否允许通过认证
   *
   * @param ctx - 执行上下文，包含请求、响应等信息
   * @returns Promise<boolean> - 返回 true 表示允许访问，false 或抛出异常表示拒绝
   */
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // 1. 检查当前路由或控制器是否标记为允许匿名访问
    // 如果标记了 @AllowAnon()，则跳过后续的 JWT 验证逻辑，直接放行
    const allowAnon = this.reflector.getAllAndOverride<boolean>(ALLOW_ANON, [
      ctx.getHandler(), // 获取当前处理请求的方法（Controller Method）
      ctx.getClass(), // 获取当前控制器类（Controller Class）
    ]);
    if (allowAnon) return true;

    // 2. 获取 HTTP 请求对象
    const req = ctx.switchToHttp().getRequest<Request>();

    // 3. 获取 Authorization 请求头
    const authHeader = req.headers.authorization;

    // 如果没有提供 Authorization 头，直接拒绝访问
    if (!authHeader) throw new ForbiddenException('请先登录');

    // 4. 解析 Token
    // 通常格式为 "Bearer <token>"，需要提取 token 部分
    const [scheme, token] = authHeader.split(' ');

    // 验证格式是否正确：必须是 Bearer 方案且 token 不为空
    if (scheme !== 'Bearer' || !token) {
      throw new ForbiddenException('无效的认证格式');
    }

    // 5. 验证 Token 有效性
    // 调用 UserService 中的 verifyToken 方法解析并验证 JWT
    // 注意：这里假设 verifyToken 返回用户ID或 null/throw error
    const atUserId = this.userService.verifyToken(token);

    // 如果 Token 无效或已过期（verifyToken 返回 null），抛出未授权异常
    if (!atUserId) {
      throw new UnauthorizedException('当前登录已过期，请重新登录');
    }

    // 6. 执行父类 AuthGuard 的标准 JWT 验证流程
    // 这会将解析后的用户信息附加到 request.user 上，供后续业务逻辑使用
    return this.activate(ctx);
  }

  /**
   * 调用父类的 canActivate 方法
   *
   * @param ctx - 执行上下文
   * @returns Promise<boolean> - 父类守卫的验证结果
   */
  async activate(ctx: ExecutionContext): Promise<boolean> {
    return super.canActivate(ctx) as Promise<boolean>;
  }
}
