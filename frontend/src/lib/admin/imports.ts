// 붙여넣기 확인 · 저장, 줄 목록 · 승인 · 제외 · 공개 제외 관리자 API 호출. 결과 타입 · 가드 방식은 datasets.ts 와 같다.

import { request } from './api.ts';
import {
	commonFailure,
	isObject,
	readBody,
	readErrorDetail,
	type CommonFailure
} from './datasets.ts';

// 아래 상수는 서버 enum 값의 단일 소스다(서버 data_core/enums.py · admin_imports/service.py 와 같아야 한다).

/** 관리자 화면에서 고를 수 있는 입력 경로. api 는 외부 연동 전용이라 서버가 받지 않는다. */
export const SOURCE_TYPES = ['claude', 'upload'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_KINDS = ['external', 'self'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const ROW_STATUSES = ['pending', 'approved', 'rejected', 'superseded'] as const;
export type RowStatus = (typeof ROW_STATUSES)[number];

/** 줄 목록 탭. excluded 는 상태가 아니라 "공개 제외 구분 칸의 승인 줄" 보기다. */
export const ROW_VIEWS = [...ROW_STATUSES, 'excluded'] as const;
export type RowView = (typeof ROW_VIEWS)[number];

export const CHANGE_KINDS = ['new', 'changed', 'as_of_only', 'carried'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
/** 분류 일괄 승인에 쓸 수 있는 분류(바뀌는 줄은 하나씩 확인). */
export type BulkApprovableKind = Extract<ChangeKind, 'new' | 'as_of_only'>;

export type RowError = { code: string; field: string | null; message: string };

/** 비교 상대였던 줄의 값 · 출처(이전값 → 새값 표시용). */
export type PrevValues = {
	data: Record<string, unknown>;
	source_kind: SourceKind | null;
	source_url: string | null;
	as_of_date: string | null;
};

export type DatasetRow = {
	id: number;
	import_id: number;
	row_key: string | null;
	data: Record<string, unknown>;
	source_kind: SourceKind | null;
	source_url: string | null;
	as_of_date: string | null;
	status: RowStatus;
	errors: RowError[] | null;
	reject_reason: string | null;
	reviewed_at: string | null;
	change_kind: ChangeKind | null;
	prev: PrevValues | null;
	/** 이 줄의 구분 칸이 공개 제외 중인지 */
	excluded: boolean;
};

export type RowPage = { rows: DatasetRow[]; truncated: boolean };

export type RowSummary = {
	new: number;
	changed: number;
	as_of_only: number;
	unchanged: number;
	error: number;
	total: number;
};

export type ImportPreview = {
	target: {
		slug: string;
		title: string;
		is_new: boolean;
		/** 묶음 제목이 기존 제목과 다름(기존 제목 유지) */
		title_differs: boolean;
		bundle_title: string | null;
	};
	schema: {
		changed: boolean;
		current_version: number | null;
		added: string[];
		removed: string[];
		modified: string[];
		carry_approved: number;
		carry_pending: number;
		/** 이월 실패로 대기였던 줄(승인 줄 없는 구분 칸)을 다시 이월: 승인 · 오류로 대기 */
		carry_retry_approved: number;
		carry_retry_pending: number;
		/** 구조가 바뀌면 대체됨이 되는 옛 구조 대기 줄 수(구조 변화 없으면 0) */
		old_pending_superseded: number;
	};
	rows: RowSummary;
};

export type ImportSaved = {
	/** false: 저장할 줄이 없고 구조 변화도 없어 아무것도 저장하지 않음 */
	saved: boolean;
	slug: string;
	rows: RowSummary;
	carry_approved: number;
	carry_pending: number;
	carry_retry_approved: number;
	carry_retry_pending: number;
	old_pending_superseded: number;
};

export type PasteInput = {
	/** null: 목록의 붙여넣기(대상은 묶음 머리로 정함) */
	slug: string | null;
	payload: string;
	sourceType: SourceType;
	defaultSourceUrl: string | null;
};

/** 붙여넣기 확인 · 저장의 실패. 화면은 kind 로 문장을 고른다(오류 코드는 보이지 않음). */
export type PasteFailure =
	| { kind: 'not_found' }
	| { kind: 'invalid_bundle'; problems: string[] }
	| { kind: 'invalid_fields'; problems: string[] }
	| { kind: 'schema_missing' }
	| { kind: 'dataset_required' }
	| { kind: 'dataset_mismatch' }
	/** 확인 뒤 상태가 바뀌어 새 묶음 · 새 구조 확정이 다시 필요함 */
	| { kind: 'confirmation_required' }
	/** 같은 주소 이름 · 구조 번호가 동시에 저장됨 */
	| { kind: 'conflict' }
	| { kind: 'invalid_input' }
	| CommonFailure;

export type PreviewResult = { kind: 'ok'; preview: ImportPreview } | PasteFailure;
export type SaveResult = { kind: 'ok'; saved: ImportSaved } | PasteFailure;
export type FetchRowPageResult =
	{ kind: 'ok'; page: RowPage } | { kind: 'not_found' } | CommonFailure;
export type ApproveResult =
	{ kind: 'ok'; approved: number } | { kind: 'not_found' } | CommonFailure;
export type RejectResult =
	| { kind: 'ok' }
	| { kind: 'not_found' }
	| { kind: 'not_pending' }
	| { kind: 'invalid_input' }
	| CommonFailure;
export type ExclusionResult = { kind: 'ok' } | { kind: 'not_found' } | CommonFailure;

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const IMPORTS_PATH = '/imports';

function datasetPath(slug: string): string {
	return `/datasets/${encodeURIComponent(slug)}`;
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function oneOf<T extends string>(values: readonly T[]) {
	return (value: unknown): value is T => values.some((candidate) => candidate === value);
}

const isRowStatus = oneOf(ROW_STATUSES);
const isSourceKind = oneOf(SOURCE_KINDS);
const isChangeKind = oneOf(CHANGE_KINDS);

function isRowError(value: unknown): value is RowError {
	return (
		isObject(value) &&
		typeof value.code === 'string' &&
		isNullableString(value.field) &&
		typeof value.message === 'string'
	);
}

function isPrevValues(value: unknown): value is PrevValues {
	return (
		isObject(value) &&
		isObject(value.data) &&
		(value.source_kind === null || isSourceKind(value.source_kind)) &&
		isNullableString(value.source_url) &&
		isNullableString(value.as_of_date)
	);
}

function isDatasetRow(value: unknown): value is DatasetRow {
	return (
		isObject(value) &&
		typeof value.id === 'number' &&
		typeof value.import_id === 'number' &&
		isNullableString(value.row_key) &&
		isObject(value.data) &&
		(value.source_kind === null || isSourceKind(value.source_kind)) &&
		isNullableString(value.source_url) &&
		isNullableString(value.as_of_date) &&
		isRowStatus(value.status) &&
		(value.errors === null || (Array.isArray(value.errors) && value.errors.every(isRowError))) &&
		isNullableString(value.reject_reason) &&
		isNullableString(value.reviewed_at) &&
		(value.change_kind === null || isChangeKind(value.change_kind)) &&
		(value.prev === null || isPrevValues(value.prev)) &&
		typeof value.excluded === 'boolean'
	);
}

function isRowPage(value: unknown): value is RowPage {
	return (
		isObject(value) &&
		typeof value.truncated === 'boolean' &&
		Array.isArray(value.rows) &&
		value.rows.every(isDatasetRow)
	);
}

function isRowSummary(value: unknown): value is RowSummary {
	return (
		isObject(value) &&
		['new', 'changed', 'as_of_only', 'unchanged', 'error', 'total'].every(
			(key) => typeof value[key] === 'number'
		)
	);
}

function isImportPreview(value: unknown): value is ImportPreview {
	if (!isObject(value) || !isObject(value.target) || !isObject(value.schema)) return false;
	const { target, schema } = value;
	return (
		typeof target.slug === 'string' &&
		typeof target.title === 'string' &&
		typeof target.is_new === 'boolean' &&
		typeof target.title_differs === 'boolean' &&
		isNullableString(target.bundle_title) &&
		typeof schema.changed === 'boolean' &&
		(schema.current_version === null || typeof schema.current_version === 'number') &&
		isStringArray(schema.added) &&
		isStringArray(schema.removed) &&
		isStringArray(schema.modified) &&
		typeof schema.carry_approved === 'number' &&
		typeof schema.carry_pending === 'number' &&
		typeof schema.carry_retry_approved === 'number' &&
		typeof schema.carry_retry_pending === 'number' &&
		typeof schema.old_pending_superseded === 'number' &&
		isRowSummary(value.rows)
	);
}

function isImportSaved(value: unknown): value is ImportSaved {
	return (
		isObject(value) &&
		typeof value.saved === 'boolean' &&
		typeof value.slug === 'string' &&
		isRowSummary(value.rows) &&
		typeof value.carry_approved === 'number' &&
		typeof value.carry_pending === 'number' &&
		typeof value.carry_retry_approved === 'number' &&
		typeof value.carry_retry_pending === 'number' &&
		typeof value.old_pending_superseded === 'number'
	);
}

function pasteBody(input: PasteInput): Record<string, unknown> {
	return {
		payload: input.payload,
		slug: input.slug,
		source_type: input.sourceType,
		default_source_url: input.defaultSourceUrl
	};
}

/** 붙여넣기 확인 · 저장 공통 실패 해석. */
async function readPasteFailure(response: Response | null): Promise<PasteFailure> {
	if (response === null) return commonFailure(response);
	if (response.status === 404) return { kind: 'not_found' };
	if (response.status !== 409 && response.status !== 422) return commonFailure(response);
	const detail = await readErrorDetail(response);
	// 요청 형식 검증(경로 선택지 · URL 형식 등) 422 는 도메인 오류 형식이 아니라 detail 이 배열이다.
	if (detail === null)
		return response.status === 422 ? { kind: 'invalid_input' } : { kind: 'unexpected' };
	switch (detail.code) {
		case 'invalid_bundle':
		case 'invalid_fields':
			return detail.problems === null
				? { kind: 'unexpected' }
				: { kind: detail.code, problems: detail.problems };
		case 'schema_missing':
		case 'dataset_required':
		case 'dataset_mismatch':
			return { kind: detail.code };
		case 'dataset_confirmation_required':
		case 'schema_confirmation_required':
		case 'concurrent_change':
			return { kind: 'confirmation_required' };
		case 'dataset_conflict':
		case 'schema_version_conflict':
			return { kind: 'conflict' };
		default:
			return { kind: 'unexpected' };
	}
}

export async function previewImport(input: PasteInput): Promise<PreviewResult> {
	const response = await request(`${IMPORTS_PATH}/preview`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify(pasteBody(input))
	});
	if (response !== null && response.status === 200) {
		const preview = await readBody(response, isImportPreview);
		return preview === null ? { kind: 'unexpected' } : { kind: 'ok', preview };
	}
	return readPasteFailure(response);
}

/** createDataset · confirmSchema: 확인 영역에서 본 새 묶음 · 구조 변화를 확정한다. */
export async function saveImport(
	input: PasteInput,
	createDataset: boolean,
	confirmSchema: boolean
): Promise<SaveResult> {
	const response = await request(IMPORTS_PATH, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify({
			...pasteBody(input),
			create_dataset: createDataset,
			confirm_schema: confirmSchema
		})
	});
	if (response !== null && response.status === 200) {
		const saved = await readBody(response, isImportSaved);
		return saved === null ? { kind: 'unexpected' } : { kind: 'ok', saved };
	}
	return readPasteFailure(response);
}

export async function fetchRows(slug: string, view: RowView): Promise<FetchRowPageResult> {
	const query = new URLSearchParams({ status: view });
	const response = await request(`${datasetPath(slug)}/rows?${query.toString()}`);
	if (response === null) return commonFailure(response);
	if (response.status === 404) return { kind: 'not_found' };
	if (response.status !== 200) return commonFailure(response);
	const page = await readBody(response, isRowPage);
	return page === null ? { kind: 'unexpected' } : { kind: 'ok', page };
}

async function readApproved(response: Response | null): Promise<ApproveResult> {
	if (response === null) return commonFailure(response);
	if (response.status === 404) return { kind: 'not_found' };
	if (response.status !== 200) return commonFailure(response);
	const body = await readBody(
		response,
		(value): value is { approved: number } => isObject(value) && typeof value.approved === 'number'
	);
	return body === null ? { kind: 'unexpected' } : { kind: 'ok', approved: body.approved };
}

/** 고른 줄 승인. 서버는 그 묶음의 승인 가능한 대기 줄만 승인하고 수를 돌려준다. */
export async function approveRows(slug: string, rowIds: number[]): Promise<ApproveResult> {
	const response = await request(`${datasetPath(slug)}/rows/approve`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify({ row_ids: rowIds })
	});
	return readApproved(response);
}

/** 분류 일괄 승인(새 줄 · 확인일만 갱신). 화면에 다 보이지 않은 줄(2,000줄 넘음)까지 승인된다. */
export async function approveKind(slug: string, kind: BulkApprovableKind): Promise<ApproveResult> {
	const response = await request(`${datasetPath(slug)}/rows/approve-kind`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify({ change_kind: kind })
	});
	return readApproved(response);
}

export async function rejectRow(
	slug: string,
	rowId: number,
	reason: string
): Promise<RejectResult> {
	const response = await request(`${datasetPath(slug)}/rows/${rowId}/reject`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify({ reason })
	});
	if (response === null) return commonFailure(response);
	if (response.status === 200) return { kind: 'ok' };
	if (response.status === 404) return { kind: 'not_found' };
	if (response.status === 409) return { kind: 'not_pending' };
	if (response.status === 422) return { kind: 'invalid_input' };
	return commonFailure(response);
}

/** excluded true: 공개 제외 · false: 복원. */
export async function setExclusion(
	slug: string,
	rowKey: string,
	excluded: boolean
): Promise<ExclusionResult> {
	const response = await request(`${datasetPath(slug)}/exclusions`, {
		method: excluded ? 'POST' : 'DELETE',
		headers: JSON_HEADERS,
		body: JSON.stringify({ row_key: rowKey })
	});
	if (response === null) return commonFailure(response);
	if (response.status === 204) return { kind: 'ok' };
	if (response.status === 404) return { kind: 'not_found' };
	return commonFailure(response);
}
