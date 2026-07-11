/**
 * @description 객체에서 지정한 키들을 제외한 새 객체를 반환한다 (원본은 변경하지 않음).
 * 응답 직렬화 시 비밀번호·내부 필드 등 민감한 값을 제거할 때 사용한다.
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/**
 * @description 객체에서 지정한 키들만 골라 새 객체를 반환한다 (원본은 변경하지 않음).
 * `omit`과 반대로, "허용된 필드만 통과시키는" 화이트리스트 방식의 필터링에 사용한다.
 * 객체에 실제로 존재하는 키만 결과에 포함된다.
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * @description 배열을 size 개씩 나눈 2차원 배열을 반환한다.
 * 배치 DB 쿼리나 bulk insert처럼 한 번에 처리할 데이터를 N개 단위로 쪼갤 때 사용한다.
 * size가 0 이하이면 에러를 던진다.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error(`chunk size must be greater than 0, got ${size}`);
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * @description 배열을 keyFn의 반환값으로 그루핑해 `Record<K, T[]>`를 반환한다.
 * 같은 키를 가진 요소들이 하나의 배열로 묶인다. 특정 키가 없을 때 결과 객체에 해당
 * 키 자체가 없으므로 접근 시 undefined 체크가 필요하다.
 */
export function groupBy<T, K extends string | number | symbol>(
  arr: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return arr.reduce(
    (acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

/**
 * @description 배열을 keyFn의 반환값으로 인덱싱해 `Record<K, T>`를 반환한다.
 * O(1) 조회용 Map을 생성할 때 사용한다. 키가 중복되면 뒤에 오는 항목으로 덮어쓴다.
 */
export function keyBy<T, K extends string | number | symbol>(
  arr: T[],
  keyFn: (item: T) => K,
): Record<K, T> {
  return arr.reduce(
    (acc, item) => {
      acc[keyFn(item)] = item;
      return acc;
    },
    {} as Record<K, T>,
  );
}

/**
 * @description 배열에서 null과 undefined를 제거하고 narrowing된 타입의 배열을 반환한다.
 * `arr.filter(Boolean)`과 달리 타입이 정확히 `T[]`로 추론된다.
 */
export function compact<T>(arr: (T | null | undefined)[]): T[] {
  return arr.filter((v): v is T => v !== null && v !== undefined);
}

/**
 * @description 여러 객체를 재귀적으로 병합한다. 양쪽 모두 일반 객체인 값은 깊은 병합을,
 * 그 외(배열·원시값 등)는 뒤에 오는 source의 값으로 덮어쓴다 (얕은 병합과 달리 중첩 객체의
 * 기존 필드가 통째로 사라지지 않음). 옵션 객체에 사용자 설정을 부분적으로 덮어쓸 때 사용한다.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  const result = { ...target };
  for (const source of sources) {
    for (const key in source) {
      const sourceVal = source[key];
      const targetVal = result[key];
      if (
        sourceVal !== null &&
        sourceVal !== undefined &&
        typeof sourceVal === "object" &&
        !Array.isArray(sourceVal) &&
        typeof targetVal === "object" &&
        targetVal !== null &&
        !Array.isArray(targetVal)
      ) {
        result[key] = deepMerge(
          targetVal as Record<string, unknown>,
          sourceVal as Record<string, unknown>,
        ) as T[typeof key];
      } else if (sourceVal !== undefined) {
        result[key] = sourceVal as T[typeof key];
      }
    }
  }
  return result;
}
