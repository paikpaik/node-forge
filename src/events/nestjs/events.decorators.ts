import { SetMetadata } from '@nestjs/common'
import { EVENTS_HANDLER_METADATA } from './events.constants'

export const OnEvent = (event: string): MethodDecorator =>
  SetMetadata(EVENTS_HANDLER_METADATA, event)
