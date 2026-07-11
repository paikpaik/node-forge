/**
 * @description node-forge 전반에서 사용하는 공통 에러 베이스 클래스. `code`(에러 코드)와
 * `cause`(원인 에러)를 함께 보존해, 에러 응답 변환·로깅 시 일관된 형태로 다룰 수 있게 한다.
 * `ForgeHttpError`/`ForgeBizError`는 모두 이 클래스를 상속한다.
 */
export class ForgeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    // instanceof 체크가 정상 동작하도록 prototype 복원
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * @description HTTP 상태 코드를 함께 갖는 에러. 외부 API 호출 실패, 잘못된 요청 등
 * "HTTP 응답으로 변환되어야 하는" 에러를 표현할 때 사용한다 (`statusCode`로 응답 코드를 결정).
 */
export class ForgeHttpError extends ForgeError {
  constructor(
    public readonly statusCode: number,
    code: string,
    message: string,
    cause?: unknown,
  ) {
    super(code, message, cause);
  }
}

/**
 * @description HTTP 상태 코드와 무관하게 발생하는 도메인/비즈니스 규칙 위반 에러.
 * "재고 부족", "이미 처리된 주문" 같이 서비스 로직에서 의도적으로 던지는 예외에 사용하며,
 * 응답 변환 계층에서 `code`를 기준으로 클라이언트에 안전한 메시지로 매핑한다.
 */
export class ForgeBizError extends ForgeError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause);
  }
}
