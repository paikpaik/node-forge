import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { SignTokenOptions } from "./auth.options";

/**
 * @description 클레임을 JWT로 서명해 발급한다. `expiresIn`은 jsonwebtoken이 받는
 * `"15m"`/`"7d"` 같은 상대 시간 문자열 그대로 전달한다.
 */
export function signToken<T extends object>(claims: T, options: SignTokenOptions): string {
  return jwt.sign(claims, options.secret, { expiresIn: options.expiresIn } as SignOptions);
}

/**
 * @description JWT를 검증해 클레임을 반환한다. 서명 불일치, 만료, 형식 손상 등
 * 검증 실패 사유를 구분하지 않고 항상 `null`로 통일해, 호출부가 `try/catch` 없이
 * 성공/실패만으로 분기할 수 있게 한다.
 */
export function verifyToken<T extends object>(token: string, secret: string): T | null {
  try {
    return jwt.verify(token, secret) as T;
  } catch {
    return null;
  }
}
