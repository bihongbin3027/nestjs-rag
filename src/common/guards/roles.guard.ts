import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { pathToRegexp } from 'path-to-regexp';

// 导入自定义装饰器，用于标记允许匿名访问或无需特定权限的接口
import { ALLOW_ANON } from '../decorators/allow-anon.decorator';
import { ALLOW_NO_PERM } from '../decorators/perm.decorator';

import { PermService } from '../../system/perm/perm.service';
import { UserType } from '../enums/common.enum';
import { Request } from 'express';

// 定义用户载荷接口，包含用户ID和类型
interface UserPayload {
  id: string;
  type: UserType;
}

// 扩展 Express 的 Request 类型，以支持自定义的 user 属性
declare module 'express' {
  interface Request {
    user?: UserPayload;
  }
}

// 定义路由配置接口，用于白名单匹配
interface RouteConfig {
  path: string;
  method: string;
}

/**
 * 角色与权限守卫
 * 负责拦截请求，验证用户身份及接口访问权限
 */
@Injectable()
export class RolesGuard implements CanActivate {
  // 全局白名单路由列表，这些路由无需进行权限校验
  private globalWhiteList: RouteConfig[] = [];

  constructor(
    // 反射器，用于读取路由或类上的元数据（如装饰器）
    private readonly reflector: Reflector,
    // 权限服务，用于获取用户的权限列表
    private readonly permService: PermService,
    // 配置服务，用于读取配置文件中的白名单等设置
    private readonly config: ConfigService,
  ) {
    // 初始化时从配置文件中加载全局白名单路由
    this.globalWhiteList = ([] as RouteConfig[]).concat(
      this.config.get('perm.router.whitelist') || [],
    );
  }

  /**
   * 判断当前请求是否允许通过
   * @param ctx 执行上下文，包含请求和响应信息
   * @returns boolean 是否允许访问
   */
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // 1. 检查是否允许匿名访问
    // 通过反射器获取控制器或处理函数上是否标记了 @AllowAnon() 装饰器
    const allowAnon = this.reflector.getAllAndOverride<boolean>(ALLOW_ANON, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    // 如果允许匿名，直接放行
    if (allowAnon) return true;

    const req = ctx.switchToHttp().getRequest<Request>();

    // 2. 检查是否在全局白名单中
    // 遍历白名单，匹配请求方法和URL路径
    const i = this.globalWhiteList.findIndex((route) => {
      // 比较HTTP方法（忽略大小写）
      if (req.method.toUpperCase() === route.method.toUpperCase()) {
        // 使用 path-to-regexp 匹配URL路径
        return !!pathToRegexp(route.path).regexp.exec(req.url);
      }
      return false;
    });

    // 如果匹配到白名单路由，直接放行
    if (i > -1) return true;

    // 3. 检查是否标记为无需特定权限
    // 获取控制器或处理函数上是否标记了 @AllowNoPerm() 装饰器
    const allowNoPerm = this.reflector.getAllAndOverride<boolean>(
      ALLOW_NO_PERM,
      [ctx.getHandler(), ctx.getClass()],
    );
    // 如果标记为无需权限校验，直接放行（通常意味着只要登录即可，或者由其他守卫处理）
    if (allowNoPerm) return true;

    // 4. 获取用户信息并校验
    const user = req.user;
    // 如果请求中没有用户信息（未登录），拒绝访问
    if (!user) return false;

    // 如果是超级管理员，拥有所有权限，直接放行
    if (user.type === UserType.SUPER_ADMIN) return true;

    // 5. 基于用户权限列表进行细粒度校验
    // 异步获取当前用户拥有的所有API权限路径
    const userPermApi = await this.permService.findUserPerms(user.id);

    // 在用户权限列表中查找是否包含当前请求的路径和方法
    const index = userPermApi.findIndex((route) => {
      if (req.method.toUpperCase() === route.method.toUpperCase()) {
        // 去除URL中的查询参数，只匹配路径部分
        const reqUrl = req.url.split('?')[0];
        return !!pathToRegexp(route.path).regexp.exec(reqUrl);
      }
      return false;
    });

    // 如果未找到匹配的权限记录，抛出禁止访问异常
    if (index === -1) throw new ForbiddenException('您无权限访问该接口');

    // 权限校验通过
    return true;
  }
}
