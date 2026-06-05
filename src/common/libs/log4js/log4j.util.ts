import Path from 'path';
import Log4js from 'log4js';
import Util from 'util';
import dayjs from 'dayjs'; // 处理时间的工具
import * as StackTrace from 'stacktrace-js';
import Chalk from 'chalk';
import config from '../../../config/index';

// 从配置中获取日志目录配置项
const appLogDirConfig = config().app.logger.dir;

// 计算并规范化日志存储的根路径
// 如果配置的是绝对路径则直接使用，否则基于当前工作目录(process.cwd())拼接相对路径
const baseLogPath = Path.normalize(
  Path.isAbsolute(appLogDirConfig)
    ? appLogDirConfig
    : Path.join(process.cwd(), appLogDirConfig),
);

/**
 * 日志级别枚举
 * 定义了从最详细到完全关闭的不同日志记录等级
 */
export enum LoggerLevel {
  ALL = 'ALL', // 开启所有级别的日志记录（包括自定义的 MARK 级别）
  MARK = 'MARK', // 标记级别，通常用于特殊的业务埋点或高亮标记
  TRACE = 'TRACE', // 追踪级别，记录最详细的程序执行轨迹，常用于调试复杂逻辑
  DEBUG = 'DEBUG', // 调试级别，记录对开发调试有帮助的信息，生产环境通常关闭
  INFO = 'INFO', // 信息级别，记录程序正常运行的关键状态和流程（默认推荐级别）
  WARN = 'WARN', // 警告级别，记录潜在的问题或非预期情况，但程序仍能正常运行
  ERROR = 'ERROR', // 错误级别，记录运行时错误，影响当前请求或操作，但程序未崩溃
  FATAL = 'FATAL', // 致命级别，记录导致应用程序无法继续运行的严重错误
  OFF = 'OFF', // 关闭所有日志记录
}

/**
 * 内容跟踪类
 * 用于在日志中携带上下文信息，如模块名、文件名、行号等，便于定位日志来源
 */
export class ContextTrace {
  constructor(
    public readonly context: string, // 上下文名称/模块名
    public readonly path?: string, // 文件路径（可选）
    public readonly lineNumber?: number, // 行号（可选）
    public readonly columnNumber?: number, // 列号（可选）
  ) {}
}

/**
 * 注册自定义日志布局格式 'Nest-App'
 * 用于控制控制台输出日志的样式和内容结构
 */
Log4js.addLayout('Nest-App', (logConfig: { type: string }) => {
  return (logEvent: Log4js.LoggingEvent): string => {
    let moduleName = '';
    let position = '';

    // 日志数据组装
    const messageList: string[] = [];
    logEvent.data.forEach((value: any) => {
      // 如果数据项是 ContextTrace 实例，提取上下文信息和位置信息
      if (value instanceof ContextTrace) {
        moduleName = value.context;
        // 显示触发日志的坐标（行，列）
        if (value.lineNumber && value.columnNumber) {
          position = `${value.lineNumber}, ${value.columnNumber}`;
        }
        return; // ContextTrace 对象本身不加入消息列表
      }

      // 将非字符串类型转换为可读字符串，保留3层深度以便查看对象结构
      const msg: string =
        typeof value === 'string' ? value : Util.inspect(value, false, 3, true);
      messageList.push(msg);
    });

    // 拼接日志的各个组成部分
    const messageOutput: string = messageList.join(' '); // 实际日志内容
    const positionOutput: string = position ? ` [${position}]` : ''; // 位置信息
    const typeOutput = `[${logConfig.type}] ${logEvent.pid.toString()} - `; // 进程ID
    const dateOutput = `${dayjs(logEvent.startTime).format('YYYY/MM/DD HH:mm:ss')}`; // 格式化时间
    const moduleOutput: string = moduleName
      ? `[${moduleName}] `
      : '[LoggerService] '; // 模块名，默认为 LoggerService
    const levelStr: string = logEvent.level.levelStr; // 日志级别字符串

    // 初始化带级别的日志输出
    let levelOutput = `[${levelStr}] ${messageOutput}`;

    // 根据日志级别，使用 Chalk 库添加不同颜色以区分严重程度
    switch (levelStr as LoggerLevel) {
      case LoggerLevel.DEBUG:
        levelOutput = Chalk.green(levelOutput);
        break;
      case LoggerLevel.INFO:
        levelOutput = Chalk.cyan(levelOutput);
        break;
      case LoggerLevel.WARN:
        levelOutput = Chalk.yellow(levelOutput);
        break;
      case LoggerLevel.ERROR:
        levelOutput = Chalk.red(levelOutput);
        break;
      case LoggerLevel.FATAL:
        levelOutput = Chalk.hex('#DD4C35')(levelOutput); // 自定义红色
        break;
      default:
        levelOutput = Chalk.grey(levelOutput);
        break;
    }

    // 返回最终格式化后的日志字符串
    // 结构: [Type] PID - Date  [Module] [Level] Message [Position]
    return `${Chalk.green(typeOutput)}${dateOutput}  ${Chalk.yellow(moduleOutput)}${levelOutput}${positionOutput}`;
  };
});

/**
 * 配置 Log4js
 * 定义日志的输出目的地（Appenders）和分类规则（Categories）
 */
Log4js.configure({
  appenders: {
    // 控制台输出，使用自定义的 'Nest-App' 布局
    console: {
      type: 'console',
      layout: { type: 'Nest-App' },
    },
    // HTTP 访问日志，按天切割文件
    access: {
      type: 'dateFile',
      filename: `${baseLogPath}/access/access.log`,
      alwaysIncludePattern: true, // 文件名中始终包含日期模式
      pattern: 'yyyyMMdd', // 日期格式
      daysToKeep: 60, // 保留60天的日志
      numBackups: 3, // 最大备份数
      category: 'http', // 关联的 category
      keepFileExt: true, // 保留文件扩展名
    },
    // 应用常规日志，按天切割，输出为 JSON 格式以便采集分析
    app: {
      type: 'dateFile',
      filename: `${baseLogPath}/app-out/app.log`,
      alwaysIncludePattern: true,
      layout: {
        type: 'pattern',
        // JSON 格式模板: 日期, 级别, 分类, 主机, PID, 消息内容
        pattern:
          '{"date":"%d","level":"%p","category":"%c","host":"%h","pid":"%z","data":\'%m\'}',
      },
      pattern: 'yyyyMMdd',
      daysToKeep: 60,
      numBackups: 3,
      keepFileExt: true,
    },
    // 错误日志文件，按天切割，输出为 JSON 格式
    errorFile: {
      type: 'dateFile',
      filename: `${baseLogPath}/errors/error.log`,
      alwaysIncludePattern: true,
      layout: {
        type: 'pattern',
        pattern:
          '{"date":"%d","level":"%p","category":"%c","host":"%h","pid":"%z","data":\'%m\'}',
      },
      pattern: 'yyyyMMdd',
      daysToKeep: 60,
      numBackups: 3,
      keepFileExt: true,
    },
    // 错误过滤器：仅将 ERROR 及以上级别的日志写入 errorFile
    errors: {
      type: 'logLevelFilter',
      level: 'ERROR',
      appender: 'errorFile',
    },
  },
  categories: {
    // 默认分类：输出到控制台、应用日志文件、错误日志文件，最低级别 DEBUG
    default: {
      appenders: ['console', 'app', 'errors'],
      level: 'DEBUG',
    },
    // info 分类：同上，但最低级别为 info
    info: { appenders: ['console', 'app', 'errors'], level: 'info' },
    // access 分类：同上，但最低级别为 info
    access: { appenders: ['console', 'app', 'errors'], level: 'info' },
    // http 分类：专门用于 HTTP 访问日志，仅输出到 access appender
    http: { appenders: ['access'], level: 'DEBUG' },
  },
  pm2: true, // 启用 PM2 支持，确保多进程下日志写入安全
  pm2InstanceVar: 'INSTANCE_ID', // 使用 PM2 分配的实例 ID 区分不同进程的日志
});

// 获取默认 logger 实例
const logger = Log4js.getLogger();
// 设置默认 logger 的最低记录级别为 TRACE（最详细）
logger.level = LoggerLevel.TRACE;

/**
 * 静态日志工具类
 * 封装 Log4js 的方法，自动注入堆栈跟踪信息以便定位代码位置
 */
export class Logger {
  /**
   * 记录 TRACE 级别日志
   */
  static trace(...args: unknown[]) {
    logger.trace(Logger.getStackTrace(), ...args);
  }

  /**
   * 记录 DEBUG 级别日志
   */
  static debug(...args: unknown[]) {
    logger.debug(Logger.getStackTrace(), ...args);
  }

  /**
   * 记录 INFO 级别日志 (别名: log)
   */
  static log(...args: unknown[]) {
    logger.info(Logger.getStackTrace(), ...args);
  }

  /**
   * 记录 INFO 级别日志
   */
  static info(...args: unknown[]) {
    logger.info(Logger.getStackTrace(), ...args);
  }

  /**
   * 记录 WARN 级别日志
   */
  static warn(...args: unknown[]) {
    logger.warn(Logger.getStackTrace(), ...args);
  }

  /**
   * 记录 WARN 级别日志 (别名: warning)
   */
  static warning(...args: unknown[]) {
    logger.warn(Logger.getStackTrace(), ...args);
  }

  /**
   * 记录 ERROR 级别日志
   */
  static error(...args: unknown[]) {
    logger.error(Logger.getStackTrace(), ...args);
  }

  /**
   * 记录 FATAL 级别日志
   */
  static fatal(...args: unknown[]) {
    logger.fatal(Logger.getStackTrace(), ...args);
  }

  /**
   * 记录 HTTP 访问日志
   * 使用专门的 'http' category，对应 access.log 文件
   */
  static access(...args: unknown[]) {
    const loggerCustom = Log4js.getLogger('http');
    loggerCustom.info(Logger.getStackTrace(), ...args);
  }

  /**
   * 获取调用者的堆栈跟踪信息
   * @param deep 堆栈深度，默认为2，用于跳过 Logger 自身的方法帧，定位到实际调用处
   * @returns 格式化的文件位置字符串，如 "filename.ts(line: 10, column: 5): \n"
   */
  static getStackTrace(deep = 2): string {
    // 同步获取堆栈帧列表
    const stackList: StackTrace.StackFrame[] = StackTrace.getSync();
    // 获取指定深度的堆栈帧
    const stackInfo: StackTrace.StackFrame = stackList[deep];

    // 提取行号、列号和文件名，提供默认值防止 undefined
    const lineNumber = stackInfo.lineNumber ?? 0;
    const columnNumber = stackInfo.columnNumber ?? 0;
    const fileName = stackInfo.fileName ?? '';
    // 只保留文件名，去除路径
    const basename: string = Path.basename(fileName);

    // 返回格式化后的位置信息
    return `${basename}(line: ${lineNumber}, column: ${columnNumber}): \n`;
  }
}
