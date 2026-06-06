import { Injectable, Inject } from '@nestjs/common'
import type { LoggerService } from '@nestjs/common'
import { ForgeLogger, createLogger } from '../logger'
import type { LoggerOptions } from '../logger.options'
import type { RequestContext } from '../../core'
import { LOGGER_OPTIONS } from './logger.constants'

@Injectable()
export class ForgeLoggerService implements LoggerService {
  private readonly logger: ForgeLogger

  constructor(@Inject(LOGGER_OPTIONS) options: LoggerOptions) {
    this.logger = createLogger(options)
  }

  log(message: string, context?: string): void {
    this.logger.info(message, context ? { context } : undefined)
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, trace ? new Error(trace) : undefined, context ? { context } : undefined)
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, context ? { context } : undefined)
  }

  debug(message: string, context?: string): void {
    this.logger.debug(message, context ? { context } : undefined)
  }

  verbose(message: string, context?: string): void {
    this.logger.verbose(message, context ? { context } : undefined)
  }

  withContext(context: Partial<RequestContext>): ForgeLogger {
    return this.logger.withContext(context)
  }
}
