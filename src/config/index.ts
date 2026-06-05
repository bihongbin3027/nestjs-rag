import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

interface AppConfig {
  prefix: string;
  port: number;
  logger: { dir: string };
  file: { location: string; domain: string; serveRoot: string };
}

interface MysqlConfig {
  host: string;
  username: string;
  password: string;
  database: string;
  port: number;
  charset: string;
  logger: string;
  logging: boolean;
  multipleStatements: boolean;
  dropSchema: boolean;
  synchronize: boolean;
  supportBigNumbers: boolean;
  bigNumberStrings: boolean;
}

interface RedisConfig {
  host: string;
  port: number;
  db: number;
  keyPrefix: string;
}

interface JwtConfig {
  secretkey: string;
  expiresin: string;
  refreshExpiresIn: string;
}

interface PermConfig {
  router: { whitelist: Array<{ path: string; method: string }> };
}

interface Config {
  app: AppConfig;
  db: { mysql: MysqlConfig };
  redis: RedisConfig;
  jwt: JwtConfig;
  perm: PermConfig;
  user: { initialPassword: string };
}

const configFileNameObj = {
  development: 'dev',
  test: 'test',
  production: 'prod',
  docker: 'docker',
} as const;

type EnvKey = keyof typeof configFileNameObj;

// 获取环境变量，默认为 development
const env = (process.env.NODE_ENV as EnvKey) || 'development';

export default () => {
  // 安全检查：确保 env 是有效的键
  if (!(env in configFileNameObj)) {
    throw new Error(`Invalid NODE_ENV: ${process.env.NODE_ENV}`);
  }

  const fileName = configFileNameObj[env];
  const filePath = join(__dirname, `./${fileName}.yml`);

  try {
    const fileContent = readFileSync(filePath, 'utf8');
    // 使用 yaml.load 并断言为 Config 类型
    return yaml.load(fileContent) as Config;
  } catch (error) {
    throw new Error(`Failed to load config file: ${filePath}. Error: ${error}`);
  }
};
