import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { ok } from '../response'
import type { ApiResponse } from '../response'

/**
 * @description 컨트롤러가 반환한 값을 가로채 자동으로 `ok(data)`로 감싸는 전역 인터셉터.
 * 모든 핸들러가 매번 `ok`/`fail`을 직접 호출하지 않아도 응답 포맷을 표준 `ApiResponse`로
 * 통일할 수 있다 (`app.useGlobalInterceptors(new ResponseInterceptor())`로 등록).
 * 에러 응답은 별도의 예외 필터에서 `fail`로 변환하는 것을 전제로 한다.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(map((data) => ok(data)))
  }
}
