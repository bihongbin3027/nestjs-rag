import { Type, applyDecorators } from '@nestjs/common';
import { ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { ResultData } from '../utils/result';

const baseTypeNames = ['String', 'Number', 'Boolean'];

interface ISchemaProperty {
  type?: string;
  properties?: {
    list?: {
      type: string;
      items?: { type?: string; $ref?: string };
    };
    total?: {
      type: string;
      default: number;
    };
    [key: string]: any;
  };
  items?: { type?: string; $ref?: string };
  nullable?: boolean;
  default?: any;
  allOf?: any[];
  $ref?: string;
}

/**
 * 封装 swagger 返回统一结构
 * 支持复杂类型 {  code, msg, data }
 * @param model 返回的 data 的数据类型
 * @param isArray data 是否是数组
 * @param isPager 设置为 true, 则 data 类型为 { list, total } , false data 类型是纯数组
 */
export const ApiResult = <TModel extends Type<any>>(
  model?: TModel,
  isArray?: boolean,
  isPager?: boolean,
) => {
  // 显式定义 items 的类型
  let items: { type?: string; $ref?: string } | undefined = undefined;

  // 确保 model 存在后再进行判断
  if (model) {
    if (baseTypeNames.includes(model.name)) {
      items = { type: model.name.toLocaleLowerCase() };
    } else {
      items = { $ref: getSchemaPath(model) };
    }
  }

  // 使用本地定义的接口
  let prop: ISchemaProperty = {};

  if (isArray && isPager) {
    prop = {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items,
        },
        total: {
          type: 'number',
          default: 0,
        },
      },
    };
  } else if (isArray) {
    prop = {
      type: 'array',
      items,
    };
  } else if (model) {
    // 此时 items 必然存在且符合结构
    prop = items as ISchemaProperty;
  } else {
    // 使用空对象或明确的 null schema 对象
    prop = { nullable: true, default: null };
  }

  return applyDecorators(
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(ResultData) },
          {
            properties: {
              data: prop,
            },
          },
        ],
      },
    }),
  );
};
