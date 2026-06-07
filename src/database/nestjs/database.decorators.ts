import { Inject } from '@nestjs/common'
import { DATABASE_DATA_SOURCE } from './database.constants'

/**
 * @description `DatabaseModule`이 등록한 `DataSource` 프로바이더를 주입하기 위한 데코레이터.
 * `DATABASE_DATA_SOURCE` 토큰으로 `@Inject`하는 것을 감춰, 토큰을 직접 알 필요 없이
 * `constructor(@InjectDataSource() private readonly dataSource: DataSource)`처럼 사용한다.
 */
export const InjectDataSource = (): ParameterDecorator => Inject(DATABASE_DATA_SOURCE)
