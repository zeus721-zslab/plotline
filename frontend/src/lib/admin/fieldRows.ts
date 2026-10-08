// 필드 정의 편집 폼의 행 모델과 전송 형식(서버 fields JSON) 사이 변환.
// 규칙 검사(이름 형식·범위·key 조합 등)는 서버가 기준이라 여기서 다시 판정하지 않는다. 입력값은 형태만 바꿔 보낸다.

import type { StoredField } from './datasets.ts';

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

export type OptionAttribute = 'min' | 'max' | 'unit' | 'max_length' | 'options';

/** 타입별로 폼에 보이는 옵션 입력. 타입을 바꾸면 여기 없는 옵션 값은 버린다. */
export const TYPE_OPTION_ATTRIBUTES: Record<FieldType, readonly OptionAttribute[]> = {
	text: ['max_length'],
	int: ['min', 'max', 'unit'],
	number: ['min', 'max', 'unit'],
	year: ['min', 'max'],
	date: [],
	category: ['options'],
	url: ['max_length'],
	bool: []
};

/** key 체크를 막는 타입(같은 값도 표기에 따라 key 문자열이 달라질 수 있음). */
export const KEY_DISALLOWED_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(['number']);

const DEFAULT_FIELD_TYPE: FieldType = 'text';
const OPTION_LINE_SEPARATOR = /\r?\n/;

export type EditorRow = {
	id: number;
	name: string;
	label: string;
	type: FieldType;
	required: boolean;
	key: boolean;
	min: string;
	max: string;
	unit: string;
	maxLength: string;
	/** 한 줄에 선택지 1개 */
	options: string;
	/** 화면에 노출하지 않는 조건 필수. 불러온 값을 그대로 다시 저장한다. */
	requiredIf: unknown;
};

let nextRowId = 0;

function newRowId(): number {
	nextRowId += 1;
	return nextRowId;
}

export function isFieldType(value: unknown): value is FieldType {
	return typeof value === 'string' && (FIELD_TYPES as readonly string[]).includes(value);
}

export function emptyRow(): EditorRow {
	return {
		id: newRowId(),
		name: '',
		label: '',
		type: DEFAULT_FIELD_TYPE,
		required: false,
		key: false,
		min: '',
		max: '',
		unit: '',
		maxLength: '',
		options: '',
		requiredIf: undefined
	};
}

function textOf(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	return '';
}

export function fieldToRow(field: StoredField): EditorRow {
	return {
		id: newRowId(),
		name: textOf(field.name),
		label: textOf(field.label),
		type: isFieldType(field.type) ? field.type : DEFAULT_FIELD_TYPE,
		required: field.required === true,
		key: field.key === true,
		min: textOf(field.min),
		max: textOf(field.max),
		unit: textOf(field.unit),
		maxLength: textOf(field.max_length),
		options: Array.isArray(field.options) ? field.options.map(textOf).join('\n') : '',
		requiredIf: field.required_if
	};
}

/** 타입 변경: 새 타입에 없는 옵션 값은 버리고, key 를 쓸 수 없는 타입이면 key 를 끈다. */
export function withType(row: EditorRow, type: FieldType): EditorRow {
	const allowed = TYPE_OPTION_ATTRIBUTES[type];
	return {
		...row,
		type,
		key: KEY_DISALLOWED_TYPES.has(type) ? false : row.key,
		min: allowed.includes('min') ? row.min : '',
		max: allowed.includes('max') ? row.max : '',
		unit: allowed.includes('unit') ? row.unit : '',
		maxLength: allowed.includes('max_length') ? row.maxLength : '',
		options: allowed.includes('options') ? row.options : ''
	};
}

// 10진수 표기만 숫자로 바꾼다. Number() 는 0x10·0b1 같은 표기도 숫자로 바꿔 입력과 다른 값이 저장될 수 있다.
const DECIMAL_NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

/** 10진수 표기면 숫자로, 아니면 입력 그대로 보내 서버가 오류를 알려 주게 한다. */
function numberOrRaw(text: string): number | string {
	const trimmed = text.trim();
	return DECIMAL_NUMBER_PATTERN.test(trimmed) ? Number(trimmed) : trimmed;
}

/** 전송 형식으로 바꾼다. 빈 선택 옵션은 속성 자체를 뺀다. */
export function rowToField(row: EditorRow): StoredField {
	const field: StoredField = { name: row.name.trim(), type: row.type };
	if (row.label.trim() !== '') field.label = row.label;
	if (row.required) field.required = true;
	if (row.key) field.key = true;
	if (row.min.trim() !== '') field.min = numberOrRaw(row.min);
	if (row.max.trim() !== '') field.max = numberOrRaw(row.max);
	if (row.unit.trim() !== '') field.unit = row.unit;
	if (row.maxLength.trim() !== '') field.max_length = numberOrRaw(row.maxLength);
	const options = row.options
		.split(OPTION_LINE_SEPARATOR)
		.map((option) => option.trim())
		.filter((option) => option !== '');
	if (options.length > 0) field.options = options;
	if (row.requiredIf !== undefined) field.required_if = row.requiredIf;
	return field;
}
