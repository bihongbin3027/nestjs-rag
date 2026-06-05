import { ApiProperty } from '@nestjs/swagger';

export class ResultData<T = any> {
  @ApiProperty({ type: 'number', default: 200 })
  code: number;

  @ApiProperty({ type: 'string', default: 'ok' })
  msg?: string;

  @ApiProperty({ description: '响应数据' })
  data?: T | null;

  /**
   * 创建一个结果对象
   * @param code 状态码
   * @param msg 提示信息
   * @param data 数据
   */
  constructor(code = 200, msg?: string, data?: T) {
    this.code = code;
    this.msg = msg || 'ok';
    // 此时 data 类型为 T | undefined，赋值给 T | null 是安全的（需处理 undefined 到 null 的转换）
    this.data = data !== undefined ? data : null;
  }

  static ok<T = any>(data?: T, msg?: string): ResultData<T> {
    return new ResultData<T>(200, msg, data);
  }

  static fail<T = any>(code: number, msg?: string, data?: T): ResultData<T> {
    return new ResultData<T>(code || 500, msg || 'fail', data);
  }
}
