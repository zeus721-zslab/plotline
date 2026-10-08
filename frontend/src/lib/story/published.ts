// 공개 데이터 형식(발행 계약). 관리자 발행 기능도 이 형식으로 /data/ 아래에 쓴다.
// static/data 는 발행 기능 전까지 쓰는 개발용 데이터다. 운영 web 은 /data/ 를 발행 볼륨으로 서빙하므로 이 파일들은 운영에서 보이지 않는다(D-14).
// question 은 선택 항목, 없으면 화면은 title 을 쓴다.

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

export type CellValue = string | number | boolean;

// 정의 배열은 관리자 정의를 그대로 싣는다. 화면은 name·type·label 만 읽으므로 나머지 속성(min·options 등)은
// 확인하지 않고 unknown 으로 둔다.
export type FieldDefinition = {
	name: string;
	type: FieldType;
	label?: string;
} & Record<string, unknown>;

export type ExternalSource = { id: string; kind: 'external'; url: string; as_of_date: string };
export type SelfSource = { id: 'self'; kind: 'self' };
export type PublishedSource = ExternalSource | SelfSource;

export type PublishedRow = {
	key: string;
	values: Record<string, CellValue>;
	// sources[].id 참조. 같은 출처를 행마다 반복하지 않아 휴대폰 전송량을 줄인다.
	source: string;
};

export type PublishedDataset = {
	dataset: string;
	title: string;
	version: number;
	schema_version: number;
	created_at: string;
	fields: FieldDefinition[];
	sources: PublishedSource[];
	rows: PublishedRow[];
};

export type StoryDatasetReference = { version: number; path: string };

export type PublishedStory = {
	story: string;
	title: string;
	question?: string;
	published_at: string;
	datasets: Record<string, StoryDatasetReference>;
};

export type StoryIndexEntry = {
	story: string;
	title: string;
	question?: string;
	summary: string;
	published_at: string;
};

export type StoryIndex = { stories: StoryIndexEntry[] };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// 저장 기준은 UTC 이며 발행 시각은 항상 Z 로 끝나는 ISO8601 이다.
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isUtcTimestamp(value: unknown): value is string {
	return isString(value) && UTC_TIMESTAMP_PATTERN.test(value);
}

function isCellValue(value: unknown): value is CellValue {
	return (
		typeof value === 'string' ||
		(typeof value === 'number' && Number.isFinite(value)) ||
		typeof value === 'boolean'
	);
}

function isFieldType(value: unknown): value is FieldType {
	return FIELD_TYPES.some((fieldType) => fieldType === value);
}

function isFieldDefinition(value: unknown): value is FieldDefinition {
	return (
		isRecord(value) &&
		isString(value.name) &&
		isFieldType(value.type) &&
		(value.label === undefined || isString(value.label))
	);
}

function isPublishedSource(value: unknown): value is PublishedSource {
	if (!isRecord(value)) return false;
	if (value.kind === 'self') return value.id === 'self';
	return (
		value.kind === 'external' &&
		isString(value.id) &&
		isString(value.url) &&
		isString(value.as_of_date) &&
		ISO_DATE_PATTERN.test(value.as_of_date)
	);
}

function isPublishedRow(value: unknown): value is PublishedRow {
	return (
		isRecord(value) &&
		isString(value.key) &&
		isString(value.source) &&
		isRecord(value.values) &&
		Object.values(value.values).every(isCellValue)
	);
}

export function isPublishedDataset(value: unknown): value is PublishedDataset {
	if (
		!isRecord(value) ||
		!isString(value.dataset) ||
		!isString(value.title) ||
		!isPositiveInteger(value.version) ||
		!isPositiveInteger(value.schema_version) ||
		!isUtcTimestamp(value.created_at) ||
		!Array.isArray(value.fields) ||
		!value.fields.every(isFieldDefinition) ||
		!Array.isArray(value.sources) ||
		!value.sources.every(isPublishedSource) ||
		!Array.isArray(value.rows) ||
		!value.rows.every(isPublishedRow)
	) {
		return false;
	}
	// 출처 없는 행은 화면에 출처를 표시할 수 없으므로 형식 오류로 본다(C3).
	const sourceIds = new Set(value.sources.map((source) => source.id));
	return value.rows.every((row) => sourceIds.has(row.source));
}

function isStoryDatasetReference(value: unknown): value is StoryDatasetReference {
	return isRecord(value) && isPositiveInteger(value.version) && isString(value.path);
}

export function isPublishedStory(value: unknown): value is PublishedStory {
	return (
		isRecord(value) &&
		isString(value.story) &&
		isString(value.title) &&
		(value.question === undefined || isString(value.question)) &&
		isUtcTimestamp(value.published_at) &&
		isRecord(value.datasets) &&
		Object.values(value.datasets).every(isStoryDatasetReference)
	);
}

function isStoryIndexEntry(value: unknown): value is StoryIndexEntry {
	return (
		isRecord(value) &&
		isString(value.story) &&
		isString(value.title) &&
		(value.question === undefined || isString(value.question)) &&
		isString(value.summary) &&
		isUtcTimestamp(value.published_at)
	);
}

export function isStoryIndex(value: unknown): value is StoryIndex {
	return isRecord(value) && Array.isArray(value.stories) && value.stories.every(isStoryIndexEntry);
}
