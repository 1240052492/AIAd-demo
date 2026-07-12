/**
 * 零依赖结构化日志。
 *
 * 用法：
 *   import { logger } from './utils/logger';
 *   logger.info('user logged in', { userId: 123 });
 *   logger.error('request failed', { err: error });
 *
 * 未来可平滑替换为 Pino / Winston：保持同样的 logger.info/warn/error/debug
 * 接口即可，调用方无需改动。
 */

type Level = 'info' | 'warn' | 'error' | 'debug';

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

const isProduction = process.env.NODE_ENV === 'production';

function write(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };

  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      entry[k] = v;
    }
  }

  // 生产环境：若 meta.err 含 Error 对象，附带 stack 便于排查。
  if (isProduction && meta?.err instanceof Error && meta.err.stack) {
    entry.stack = meta.err.stack;
  }

  const line = JSON.stringify(entry);
  // error 级别输出到 stderr，其余到 stdout。
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger: Logger = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
  debug: (msg, meta) => write('debug', msg, meta),
};

export default logger;
