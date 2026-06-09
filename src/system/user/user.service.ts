import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { instanceToPlain } from 'class-transformer';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { genSalt, hash, compare } from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import ms from 'ms';

import { ResultData } from '../../common/utils/result';
import { AppHttpCode } from '../../common/enums/code.enum';
import { RedisKeyPrefix } from '../../common/enums/redis-key-prefix.enum';
import { StatusValue, UserType } from '../../common/enums/common.enum';
import { validPhone, validEmail } from '../../common/utils/validate';
import { getRedisKey } from '../../common/utils/utils';
import { RedisService } from '../../common/libs/redis/redis.service';

import { UserRoleService } from './role/user-role.service';

import { UserEntity } from '../user/entities/user.entity';
import { UserRoleEntity } from './role/user-role.entity';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateTokenDto } from './dto/create-token.dto';
import { CreateOrUpdateUserRolesDto } from './dto/create-user-roles.dto';

// 定义 JWT payload 接口，根据实际签发内容调整字段
interface JwtPayload {
  sub: number; // 通常用户ID存储在 sub 字段
  username?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userRoleService: UserRoleService,
  ) {}

  async findOneByAccount(account: string): Promise<UserEntity | null> {
    return this.userRepository.findOneBy({ account });
  }

  /**
   * 用户注册
   */
  async create(createUserDto: CreateUserDto): Promise<ResultData> {
    if (createUserDto.password !== createUserDto.confirmPassword) {
      return ResultData.fail(
        AppHttpCode.USER_PASSWORD_INVALID,
        '两次输入密码不一致，请重试',
      );
    }

    // 防止重复创建
    if (await this.findOneByAccount(createUserDto.account)) {
      return ResultData.fail(
        AppHttpCode.USER_CREATE_EXISTING,
        '用户已存在，请直接登录',
      );
    }

    if (
      await this.userRepository.findOne({
        where: { phoneNum: createUserDto.phoneNum },
      })
    ) {
      return ResultData.fail(
        AppHttpCode.USER_CREATE_EXISTING,
        '当前手机号已存在，请调整后重新注册',
      );
    }

    if (
      await this.userRepository.findOne({
        where: { email: createUserDto.email },
      })
    ) {
      return ResultData.fail(
        AppHttpCode.USER_CREATE_EXISTING,
        '当前邮箱已存在，请调整后重新注册',
      );
    }

    // 密码加密处理
    // 生成随机盐值以增强安全性
    const salt = await genSalt();
    // 使用盐值对原始密码进行哈希加密，避免明文存储
    const hashedPassword = await hash(createUserDto.password, salt);

    // 将 DTO 数据转换为 Entity 实例，并替换密码为哈希值，同时保存盐值
    const user = plainToInstance(
      UserEntity,
      {
        ...createUserDto, // 展开 DTO 中的其他字段（如 account, phoneNum 等）
        password: hashedPassword, // 覆盖原始密码为加密后的密码
        salt, // 保存生成的盐值（用于后续登录验证）
      },
      { ignoreDecorators: true }, // 忽略类转换器装饰器，直接映射属性
    );

    // 数据库持久化 使用事务确保数据写入的原子性，防止部分写入导致的数据不一致
    const result = await this.entityManager.transaction(
      async (transactionalEntityManager) => {
        // 在事务上下文中保存用户实体
        return await transactionalEntityManager.save<UserEntity>(user);
      },
    );

    // 将实体实例转换为普通对象（去除 TypeORM 内部属性），并封装为成功响应
    return ResultData.ok(instanceToPlain(result));
  }

  /**
   * 用户登录
   * account 有可能是 帐号/手机/邮箱
   */
  async login(account: string, password: string): Promise<ResultData> {
    let user = null;
    if (validPhone(account)) {
      // 手机登录
      user = await this.userRepository.findOne({
        where: { phoneNum: account },
      });
    } else if (validEmail(account)) {
      // 邮箱
      user = await this.userRepository.findOne({ where: { email: account } });
    } else {
      // 帐号
      user = await this.findOneByAccount(account);
    }
    if (!user)
      return ResultData.fail(
        AppHttpCode.USER_PASSWORD_INVALID,
        '帐号或密码错误',
      );
    const checkPassword = await compare(password, user.password);
    if (!checkPassword)
      return ResultData.fail(
        AppHttpCode.USER_PASSWORD_INVALID,
        '帐号或密码错误',
      );
    if (user.status === StatusValue.FORBIDDEN)
      return ResultData.fail(
        AppHttpCode.USER_ACCOUNT_FORBIDDEN,
        '您已被禁用，如需正常使用请联系管理员',
      );
    // 生成 token
    const data = this.genToken({ id: user.id });
    return ResultData.ok(data);
  }

  /**
   * 生成 token
   * @param payload
   * @returns
   */
  genToken(payload: { id: string }): CreateTokenDto {
    const accessToken = `Bearer ${this.jwtService.sign(payload)}`;
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string | number>(
        'jwt.refreshExpiresIn',
      ),
    });
    return { accessToken, refreshToken };
  }

  /**
   * 刷新 token
   * @param refreshToken
   * @returns
   */
  async updateToken(userId: string): Promise<ResultData> {
    const newToken = this.genToken({ id: userId });
    return Promise.resolve(ResultData.ok(newToken));
  }

  /**
   * 校验 token
   */
  verifyToken(token: string): JwtPayload | null {
    try {
      if (!token) return null;

      // 移除 Bearer 前缀
      const rawToken = token.startsWith('Bearer ')
        ? token.replace('Bearer ', '')
        : token;

      // 显式指定泛型类型，避免 any
      const payload: JwtPayload = this.jwtService.verify<JwtPayload>(rawToken);

      return payload;
    } catch {
      // 建议记录日志 error.message
      return null;
    }
  }

  /**
   * 根据 id 查询用户
   */
  async findOneById(id: string): Promise<UserEntity | null> {
    const redisKey = getRedisKey(RedisKeyPrefix.USER_INFO, id);
    const result = await this.redisService.hGetAll(redisKey);
    // plainToInstance 去除 password slat
    let user = plainToInstance(UserEntity, result, {
      enableImplicitConversion: true,
    });
    if (!user?.id) {
      const dbUser = await this.userRepository.findOne({ where: { id } });
      if (!dbUser) return null;
      user = plainToInstance(UserEntity, dbUser, {
        enableImplicitConversion: true,
      });
      await this.redisService.hmset(
        redisKey,
        instanceToPlain(user),
        ms(this.configService.get<string>('jwt.expiresin') ?? '1h') / 1000,
      );
    }
    user.password = '';
    user.salt = '';
    return user;
  }

  /**
   * 创建或更新用户-角色
   */
  async createOrUpdateUserRole(
    dto: CreateOrUpdateUserRolesDto,
  ): Promise<ResultData> {
    const userRoleList = plainToInstance(
      UserRoleEntity,
      dto.roleIds.map((roleId) => {
        return { roleId, userId: dto.userId };
      }),
    );
    const res = await this.entityManager.transaction(
      async (transactionalEntityManager) => {
        await transactionalEntityManager.delete(UserRoleEntity, {
          userId: dto.userId,
        });
        const result =
          await transactionalEntityManager.save<UserRoleEntity>(userRoleList);
        return result;
      },
    );
    if (!res)
      return ResultData.fail(AppHttpCode.SERVICE_ERROR, '用户更新角色失败');
    await this.redisService.set(
      getRedisKey(RedisKeyPrefix.USER_ROLE, dto.userId),
      JSON.stringify(dto.roleIds),
    );
    return ResultData.ok();
  }

  /**
   * 更新用户信息
   */
  async update(dto: UpdateUserDto, currUser: UserEntity): Promise<ResultData> {
    const existing = await this.findOneById(dto.id);
    if (!existing)
      return ResultData.fail(
        AppHttpCode.USER_NOT_FOUND,
        '当前用户不存在或已删除',
      );
    if (existing.status === StatusValue.FORBIDDEN)
      return ResultData.fail(
        AppHttpCode.USER_ACCOUNT_FORBIDDEN,
        '当前用户已被禁用，不可更新用户信息',
      );
    if (
      existing.type === UserType.SUPER_ADMIN &&
      currUser.type === UserType.ORDINARY_USER
    ) {
      return ResultData.fail(
        AppHttpCode.USER_FORBIDDEN_UPDATE,
        '您不可修改超管信息喔',
      );
    }
    const roleIds = dto.roleIds || [];
    const userInfo = instanceToPlain(dto);
    delete userInfo.roleIds;
    const { affected } = await this.entityManager.transaction(
      async (transactionalEntityManager) => {
        if (roleIds.length > 0) {
          await this.createOrUpdateUserRole({ userId: dto.id, roleIds });
        }
        return await transactionalEntityManager.update<UserEntity>(
          UserEntity,
          dto.id,
          userInfo,
        );
      },
    );
    if (!affected)
      ResultData.fail(AppHttpCode.SERVICE_ERROR, '更新失败，请稍后重试');

    await this.redisService.del(getRedisKey(RedisKeyPrefix.USER_INFO, dto.id));
    // redis 更新用户信息
    return ResultData.ok();
  }
}
