import { Inject } from '@nestjs/common'
import { HTTP_CLIENT } from './http.constants'

/**
 * @description `HttpModule`이 등록한 `ForgeHttpClient` 프로바이더를 주입하기 위한 데코레이터.
 * `HTTP_CLIENT` 토큰으로 `@Inject`하는 것을 감춰, 토큰을 직접 알 필요 없이
 * `constructor(@InjectHttpClient() private readonly http: ForgeHttpClient)`처럼 사용한다.
 */
export const InjectHttpClient = (): ParameterDecorator => Inject(HTTP_CLIENT)
