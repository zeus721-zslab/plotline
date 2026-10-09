// 데이터 묶음 목록 · 상세 관리자 API 호출. 응답은 타입 가드로 확인하고, 네트워크 오류와 예상 밖 응답을 구분해 돌려준다.
// 묶음 만들기는 붙여넣기 저장(imports.ts)이 맡는다(D-28).

import { readJson, request } from './api.ts';

/** 서버가 검사를 통과시켜 저장한 필드 정의 1개. 속성 규칙은 서버가 기준이라 화면은 형태만 확인한다. */
export type StoredField = Record<string, unknown>;

export type DatasetSummary = {
	slug: string;
	title: string;
	created_at: string;
	latest_version_no: number | null;
	/** 공개 파일까지 쓴(done) 판 중 가장 큰 번호 */
	latest_published_version_no: number | null;
	/** 검토할 줄(대기 줄 전부, 오류 줄 포함) */
	pending_count: number;
	/** 기록본 후보가 있고 최신 기록본과 구성이 다름 */
	has_unpublished_changes: boolean;
};

export type SchemaVersion = {
	version: number;
	fields: StoredField[];
	created_at: string;
};

/** 탭별 줄 수. pending = pending_error + pending_new + pending_changed + pending_as_of_only. */
export type RowCounts = {
	pending: number;
	/** 오류 있는 대기 줄 전부(구조 이월 실패 포함) */
	pending_error: number;
	pending_carry_failed: number;
	pending_new: number;
	pending_changed: number;
	pending_as_of_only: number;
	approved: number;
	rejected: number;
	superseded: number;
	excluded_keys: number;
};

export type DatasetDetail = {
	slug: string;
	title: string;
	created_at: string;
	latest_version_no: number | null;
	latest_published_version_no: number | null;
	has_unpublished_changes: boolean;
	schema: SchemaVersion | null;
	counts: RowCounts;
};

/** 모든 호출에 공통인 실패. unauthorized 는 api.ts 가 로그인 화면 전환을 이미 알린 상태다. */
export type CommonFailure =
	| { kind: 'unauthorized' }
	| { kind: 'forbidden' }
	| { kind: 'network_error' }
	| { kind: 'unexpected' };

export type ListDatasetsResult = { kind: 'ok'; datasets: DatasetSummary[] } | CommonFailure;
export type FetchDatasetResult =
	{ kind: 'ok'; dataset: DatasetDetail } | { kind: 'not_found' } | CommonFailure;

const DATASETS_PATH = '/datasets';
const ROW_COUNT_KEYS = [
	'pending',
	'pending_error',
	'pending_carry_failed',
	'pending_new',
	'pending_changed',
	'pending_as_of_only',
	'approved',
	'rejected',
	'superseded',
	'excluded_keys'
] as const satisfies readonly (keyof RowCounts)[];

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableNumber(value: unknown): value is number | null {
	return value === null || typeof value === 'number';
}

function isDatasetSummary(value: unknown): value is DatasetSummary {
	return (
		isObject(value) &&
		typeof value.slug === 'string' &&
		typeof value.title === 'string' &&
		typeof value.created_at === 'string' &&
		isNullableNumber(value.latest_version_no) &&
		isNullableNumber(value.latest_published_version_no) &&
		typeof value.pending_count === 'number' &&
		typeof value.has_unpublished_changes === 'boolean'
	);
}

function isSchemaVersion(value: unknown): value is SchemaVersion {
	return (
		isObject(value) &&
		typeof value.version === 'number' &&
		typeof value.created_at === 'string' &&
		Array.isArray(value.fields) &&
		value.fields.every(isObject)
	);
}

function isRowCounts(value: unknown): value is RowCounts {
	return isObject(value) && ROW_COUNT_KEYS.every((key) => typeof value[key] === 'number');
}

function isDatasetDetail(value: unknown): value is DatasetDetail {
	return (
		isObject(value) &&
		typeof value.slug === 'string' &&
		typeof value.title === 'string' &&
		typeof value.created_at === 'string' &&
		isNullableNumber(value.latest_version_no) &&
		isNullableNumber(value.latest_published_version_no) &&
		typeof value.has_unpublished_changes === 'boolean' &&
		(value.schema === null || isSchemaVersion(value.schema)) &&
		isRowCounts(value.counts)
	);
}

type ErrorDetail = { code: string; problems: string[] | null };

/** 도메인 오류 응답 {"detail": {"code", "message", "problems"?}} 에서 code·problems 를 꺼낸다. */
export async function readErrorDetail(response: Response): Promise<ErrorDetail | null> {
	const parsed = await readJson(response);
	if (parsed.kind === 'invalid_json' || !isObject(parsed.body)) return null;
	const detail = parsed.body.detail;
	if (!isObject(detail) || typeof detail.code !== 'string') return null;
	const problems = detail.problems;
	if (Array.isArray(problems) && problems.every((problem) => typeof problem === 'string')) {
		return { code: detail.code, problems };
	}
	return { code: detail.code, problems: null };
}

export function commonFailure(response: Response | null): CommonFailure {
	if (response === null) return { kind: 'network_error' };
	if (response.status === 401) return { kind: 'unauthorized' };
	if (response.status === 403) return { kind: 'forbidden' };
	return { kind: 'unexpected' };
}

export async function readBody<T>(response: Response, guard: (value: unknown) => value is T) {
	const parsed = await readJson(response);
	if (parsed.kind === 'invalid_json' || !guard(parsed.body)) return null;
	return parsed.body;
}

export async function listDatasets(): Promise<ListDatasetsResult> {
	const response = await request(DATASETS_PATH);
	if (response === null || response.status !== 200) return commonFailure(response);
	const datasets = await readBody(response, (value): value is DatasetSummary[] => {
		return Array.isArray(value) && value.every(isDatasetSummary);
	});
	return datasets === null ? { kind: 'unexpected' } : { kind: 'ok', datasets };
}

export async function fetchDataset(slug: string): Promise<FetchDatasetResult> {
	const response = await request(`${DATASETS_PATH}/${encodeURIComponent(slug)}`);
	if (response === null) return commonFailure(response);
	if (response.status === 200) {
		const dataset = await readBody(response, isDatasetDetail);
		return dataset === null ? { kind: 'unexpected' } : { kind: 'ok', dataset };
	}
	if (response.status === 404) return { kind: 'not_found' };
	return commonFailure(response);
}
