// 필드 value 형식의 단일 소스. 구조 직접 편집 화면은 D-28 에서 없어져, 구조 보기가 쓰는 형식 판정만 남는다.
// 규칙 검사(이름 형식·범위·key 조합 등)는 서버가 기준이라 여기서 다시 판정하지 않는다.

/** 필드 타입 단일 소스. 서버 FieldType 과 같은 8종. */
export const FIELD_TYPES = [
	'text',
	'int',
	'number',
	'year',
	'date',
	'category',
	'url',
	'bool'
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export function isFieldType(value: unknown): value is FieldType {
	return typeof value === 'string' && (FIELD_TYPES as readonly string[]).includes(value);
}
