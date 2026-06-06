import { Inject } from '@nestjs/common'
import { HTTP_CLIENT } from './http.constants'

export const InjectHttpClient = (): ParameterDecorator => Inject(HTTP_CLIENT)
