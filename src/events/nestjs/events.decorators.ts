import { SetMetadata } from '@nestjs/common'
import { EVENTS_HANDLER_METADATA } from './events.constants'

/**
 * @description 메서드에 "이 메서드가 처리할 이벤트 이름"을 메타데이터로 표시한다.
 * 직접 `eventBus.on(...)`을 호출하지 않아도, `EventsExplorer`가 모듈 부팅 시 이 메타데이터를
 * 스캔해 자동으로 리스너를 등록해준다 (`@OnEvent('order.created')`처럼 선언적으로 사용).
 */
export const OnEvent = (event: string): MethodDecorator =>
  SetMetadata(EVENTS_HANDLER_METADATA, event)
