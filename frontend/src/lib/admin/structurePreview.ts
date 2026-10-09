// 데이터 구조 보기의 사람이 읽는 허용 범위 문장과 예시 JSON(항목 한 줄 · 발행 파일 모양)을 만든다(순수 함수).
// 예시 값은 형식별 고정값이며 실제 데이터가 아니다. 발행 파일 모양은 공개 발행 형식(PublishedDataset)과 같은 key 이름을 쓴다.

import type { StoredField } from './datasets.ts';
import { isFieldType, type FieldType } from './fieldRows.ts';
import type { CellValue, PublishedDataset } from '../story/published.ts';

const ROW_KEY_SEPARATOR = '|';
const EXAMPLE_DATE = '2026-01-01';
const EXAMPLE_SOURCE_URL = 'https://…';
const EXAMPLE_SOURCE_ID = 's1';
const EXAMPLE_VERSION = 1;
const EXAMPLE_TEXT = '예시';

/** 형식별 고정 예시 값(선택지는 첫 선택지를 따로 고른다). */
const EXAMPLE_VALUES: Record<Exclude<FieldType, 'category'>, CellValue> = {
	text: EXAMPLE_TEXT,
	int: 1,
	number: 1.5,
	year: 2000,
	date: EXAMPLE_DATE,
	url: 'https://example.com',
	bool: true
};

/** 발행 파일 모양 예시. 공개 형식 중 구조 이해에 필요한 key 만 싣는다(title · schema_version · created_at 생략). */
export type PublishedExample = Pick<
	PublishedDataset,
	'dataset' | 'version' | 'fields' | 'sources' | 'rows'
>;

function numberOf(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fieldName(field: StoredField): string {
	return typeof field.name === 'string' ? field.name : '';
}

/** 허용 범위를 사람이 읽는 문장으로. 조건이 없으면 빈 문자열. */
export function constraintText(field: StoredField): string {
	const parts: string[] = [];
	const min = numberOf(field.min);
	const max = numberOf(field.max);
	const maxLength = numberOf(field.max_length);
	if (min !== null) parts.push(`${min} 이상`);
	if (max !== null) parts.push(`${max} 이하`);
	if (maxLength !== null) parts.push(`${maxLength}자 이하`);
	if (Array.isArray(field.options)) parts.push(`고를 수 있는 값: ${field.options.join(', ')}`);
	if (typeof field.unit === 'string') parts.push(`단위 ${field.unit}`);
	return parts.join(' · ');
}

/** 형식별 예시 값. 최솟값이 있으면 최솟값, 기본값이 최댓값을 넘으면 최댓값, 글자 수 제한이 있으면 그 길이로 자른다. */
function exampleValue(field: StoredField): CellValue {
	if (!isFieldType(field.type)) return EXAMPLE_TEXT;
	if (field.type === 'category') {
		return Array.isArray(field.options) && typeof field.options[0] === 'string'
			? field.options[0]
			: EXAMPLE_TEXT;
	}
	const base = EXAMPLE_VALUES[field.type];
	if (typeof base === 'number') {
		const min = numberOf(field.min);
		if (min !== null) return min;
		const max = numberOf(field.max);
		return max !== null && base > max ? max : base;
	}
	const maxLength = numberOf(field.max_length);
	if (field.type === 'text' && typeof base === 'string' && maxLength !== null) {
		return base.slice(0, maxLength);
	}
	return base;
}

/** 구조 순서대로 key 의 예시 값. */
function exampleValues(fields: StoredField[]): Record<string, CellValue> {
	const values: Record<string, CellValue> = {};
	for (const field of fields) {
		values[fieldName(field)] = exampleValue(field);
	}
	return values;
}

/** 붙여 넣는 항목 한 줄(JSON 객체 하나): 구조 순서의 key 뒤에 출처 key 3개. */
export function exampleRow(fields: StoredField[]): Record<string, CellValue> {
	return {
		...exampleValues(fields),
		source_kind: 'external',
		source_url: EXAMPLE_SOURCE_URL,
		as_of_date: EXAMPLE_DATE
	};
}

/** 발행되는 파일 모양. 행 key 는 구분 칸 값을 구조 순서대로 | 로 잇는다. */
export function examplePublished(slug: string, fields: StoredField[]): PublishedExample {
	const values = exampleValues(fields);
	const rowKey = fields
		.filter((field) => field.key === true)
		.map((field) => String(values[fieldName(field)]))
		.join(ROW_KEY_SEPARATOR);
	return {
		dataset: slug,
		version: EXAMPLE_VERSION,
		fields: fields.map((field) => ({
			...field,
			name: fieldName(field),
			type: isFieldType(field.type) ? field.type : 'text'
		})),
		sources: [
			{
				id: EXAMPLE_SOURCE_ID,
				kind: 'external',
				url: EXAMPLE_SOURCE_URL,
				as_of_date: EXAMPLE_DATE
			}
		],
		rows: [{ key: rowKey, values, source: EXAMPLE_SOURCE_ID }]
	};
}
