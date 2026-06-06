import { Inject } from '@nestjs/common'
import { DATABASE_DATA_SOURCE } from './database.constants'

export const InjectDataSource = (): ParameterDecorator => Inject(DATABASE_DATA_SOURCE)
