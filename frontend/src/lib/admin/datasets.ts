// 데이터셋·필드 정의 관리자 API 호출. 응답은 타입 가드로 확인하고, 네트워크 오류와 예상 밖 응답을 구분해 돌려준다.

import { readJson, request } from './api.ts';

/** 서버가 검사를 통과시켜 저장한 필드 정의 1개. 속성 규칙은 서버가 기준이라 화면은 형태만 확인한다. */
export type StoredField = Record<string, unknown>;

export type DatasetSummary = {
	slug: string;
	title: string;
	created_at: string;
	schema_version: number | null;
};

export type SchemaVersion = {
	version: number;
	fields: StoredField[];
	created_at: string;
};

export type DatasetDetail = {
	slug: string;
	title: string;
	created_at: string;
	schema: SchemaVersion | null;
};

/** 모든 호출에 공통인 실패. unauthorized 는 api.ts 가 로그인 화면 전환을 이미 알린 상태다. */
export type CommonFailure =
	| { kind: 'unauthorized' }
	| { kind: 'forbidden' }
	| { kind: 'network_error' }
	| { kind: 'unexpected' };

export type ListDatasetsResult = { kind: 'ok'; datasets: DatasetSummary[] } | CommonFailure;
export type CreateDatasetResult =
	| { kind: 'ok'; dataset: DatasetSummary }
	| { kind: 'slug_taken' }
	| { kind: 'invalid_input' }
	| CommonFailure;
export type FetchDatasetResult =
	{ kind: 'ok'; dataset: DatasetDetail } | { kind: 'not_found' } | CommonFailure;
export type SaveSchemaResult =
	| { kind: 'ok'; schema: SchemaVersion }
	| { kind: 'not_found' }
	| { kind: 'invalid_fields'; problems: string[] }
	| { kind: 'invalid_input' }
	| { kind: 'unchanged' }
	| { kind: 'version_conflict' }
	| CommonFailure;

const DATASETS_PATH = '/datasets';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDatasetSummary(value: unknown): value is DatasetSummary {
	return (
		isObject(value) &&
		typeof value.slug === 'string' &&
		typeof value.title === 'string' &&
		typeof value.created_at === 'string' &&
		(value.schema_version === null || typeof value.schema_version === 'number')
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

function isDatasetDetail(value: unknown): value is DatasetDetail {
	return (
		isObject(value) &&
		typeof value.slug === 'string' &&
		typeof value.title === 'string' &&
		typeof value.created_at === 'string' &&
		(value.schema === null || isSchemaVersion(value.schema))
	);
}

type ErrorDetail = { code: string; problems: string[] | null };

/** 도메인 오류 응답 {"detail": {"code", "message", "problems"?}} 에서 code·problems 를 꺼낸다. */
async function readErrorDetail(response: Response): Promise<ErrorDetail | null> {
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

function commonFailure(response: Response | null): CommonFailure {
	if (response === null) return { kind: 'network_error' };
	if (response.status === 401) return { kind: 'unauthorized' };
	if (response.status === 403) return { kind: 'forbidden' };
	return { kind: 'unexpected' };
}

async function readBody<T>(response: Response, guard: (value: unknown) => value is T) {
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

export async function createDataset(slug: string, title: string): Promise<CreateDatasetResult> {
	const response = await request(DATASETS_PATH, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify({ slug, title })
	});
	if (response === null) return commonFailure(response);
	if (response.status === 201) {
		const dataset = await readBody(response, isDatasetSummary);
		return dataset === null ? { kind: 'unexpected' } : { kind: 'ok', dataset };
	}
	if (response.status === 409) {
		const detail = await readErrorDetail(response);
		if (detail !== null && detail.code === 'dataset_slug_taken') return { kind: 'slug_taken' };
		return { kind: 'unexpected' };
	}
	if (response.status === 422) return { kind: 'invalid_input' };
	return commonFailure(response);
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

export async function saveSchema(slug: string, fields: StoredField[]): Promise<SaveSchemaResult> {
	const response = await request(`${DATASETS_PATH}/${encodeURIComponent(slug)}/schemas`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify({ fields })
	});
	if (response === null) return commonFailure(response);
	if (response.status === 201) {
		const schema = await readBody(response, isSchemaVersion);
		return schema === null ? { kind: 'unexpected' } : { kind: 'ok', schema };
	}
	if (response.status === 404) return { kind: 'not_found' };
	if (response.status === 409 || response.status === 422) {
		const detail = await readErrorDetail(response);
		// 형식 검증(필드 개수 등) 422 는 도메인 오류 형식이 아니라 detail 이 배열이다.
		if (detail === null) {
			return response.status === 422 ? { kind: 'invalid_input' } : { kind: 'unexpected' };
		}
		if (detail.code === 'invalid_fields' && detail.problems !== null) {
			return { kind: 'invalid_fields', problems: detail.problems };
		}
		if (detail.code === 'schema_unchanged') return { kind: 'unchanged' };
		if (detail.code === 'schema_version_conflict') return { kind: 'version_conflict' };
		return { kind: 'unexpected' };
	}
	return commonFailure(response);
}
