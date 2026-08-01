import { Subject } from "rxjs";
import type { Observable } from "rxjs";

/**
 * @description 프로세스 내부에서 발생한 임의의 이벤트를 실시간으로 멀티캐스트하는 버스.
 * 이벤트명 기반 pub/sub인 `ForgeEventBus`와 달리, "지금 구독 중인 모든 클라이언트에게 그대로
 * 흘려보내는" 방송 스트림이 목적이라 rxjs `Subject`로 구현한다 — SSE처럼 여러 클라이언트가
 * 동시에 구독해도 전부 같은 이벤트를 받고, 구독 이전에 emit된 이벤트는 받지 못한다(hot observable).
 */
export class AdminEventBus<T = unknown> {
  private readonly subject = new Subject<T>();

  readonly stream$: Observable<T> = this.subject.asObservable();

  /**
   * @description 현재 구독 중인 모든 클라이언트에게 이벤트를 방송한다. 구독자가 없어도 에러 없이
   * 무시된다.
   */
  emit(event: T): void {
    this.subject.next(event);
  }
}
