export interface LoggerOptions {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  pretty?: boolean
  redact?: string[]
  name?: string
  base?: Record<string, unknown>
}
