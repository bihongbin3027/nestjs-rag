import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginUserDto {
  @ApiProperty({ description: '账号' })
  @IsString({ message: '账号必须为字符串' })
  @IsNotEmpty({ message: '账号不能为空' })
  readonly account!: string;

  @ApiProperty({ description: '密码' })
  @IsString({ message: '密码必须为字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  readonly password!: string;
}
