import pino from 'pino'
import type { LoggerOptions } from './logger.options'
import type { RequestContext } from '../core'

export class ForgeLogger {
  private constructor(private readonly _pino: pino.Logger) {}

  static create(options: LoggerOptions = {}): ForgeLogger {
    const instance = pino({
      level: options.level ?? 'info',
      name: options.name,
      base: options.base ?? {},
      redact: options.redact,
      ...(options.pretty && {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      }),
    })
    return new ForgeLogger(instance)
  }

  withContext(context: Partial<RequestContext> & Record<string, unknown>): ForgeLogger {
    return new ForgeLogger(this._pino.child(context))
  }

  log(msg: string, data?: Record<string, unknown>): void {
    data ? this._pino.info(data, msg) : this._pino.info(msg)
  }

  info(msg: string, data?: Record<string, unknown>): void {
    data ? this._pino.info(data, msg) : this._pino.info(msg)
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    data ? this._pino.warn(data, msg) : this._pino.warn(msg)
  }

  error(msg: string, error?: unknown, data?: Record<string, unknown>): void {
    this._pino.error({ err: error, ...data }, msg)
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    data ? this._pino.debug(data, msg) : this._pino.debug(msg)
  }

  verbose(msg: string, data?: Record<string, unknown>): void {
    data ? this._pino.trace(data, msg) : this._pino.trace(msg)
  }
}

export function createLogger(options?: LoggerOptions): ForgeLogger {
  return ForgeLogger.create(options)
}
