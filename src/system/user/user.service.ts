import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { instanceToPlain } from 'class-transformer';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { genSalt, hash, compare, genSaltSync, hashSync } from 'bcryptjs';
import { plainToInstance } from 'class-transformer';

import { ResultData } from '../../common/utils/result';
import { AppHttpCode } from '../../common/enums/code.enum';

import { UserEntity } from '../user/entities/user.entity';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateTokenDto } from './dto/create-token.dto';

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
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
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
   */
  async login(account: string, password: string): Promise<ResultData> {
    return Promise.resolve(ResultData.ok({ id: '1234' }));
  }

  /**
   * 生成 token
   * @param payload
   * @returns
   */
  genToken(payload: { id: string }): CreateTokenDto {
    const accessToken = `Bearer ${this.jwtService.sign(payload)}`;
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('jwt.refreshExpiresIn'),
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

  /** 校验 token */
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
}
