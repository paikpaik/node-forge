export class ForgeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
    // instanceof 체크가 정상 동작하도록 prototype 복원
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ForgeHttpError extends ForgeError {
  constructor(
    public readonly statusCode: number,
    code: string,
    message: string,
    cause?: unknown,
  ) {
    super(code, message, cause)
  }
}

export class ForgeBizError extends ForgeError {
  constructor(
    code: string,
    message: string,
    cause?: unknown,
  ) {
    super(code, message, cause)
  }
}
