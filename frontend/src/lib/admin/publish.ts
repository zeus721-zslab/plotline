// 발행(기록본 + 공개 파일, D-29) 관리자 API 호출. 결과 타입 · 가드 방식은 datasets.ts 와 같다.

import { request } from './api.ts';
import {
	commonFailure,
	isObject,
	readBody,
	readErrorDetail,
	type CommonFailure
} from './datasets.ts';

/** 서버 PublishStatus(data_core/enums.py)의 단일 소스. */
export const PUBLISH_STATUSES = ['pending', 'done', 'failed', 'abandoned'] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

/** 이야기가 가리키는 판 번호가 이 묶음에 없을 때의 상태(서버 admin_imports/publish.py MISSING_VERSION_STATUS). */
export const MISSING_VERSION_STATUS = 'missing';
export type ReferencedVersionStatus = PublishStatus | typeof MISSING_VERSION_STATUS;

/** 서버 발행 실패 코드(admin_imports/publish.py)의 단일 소스. 화면은 코드 대신 terms.ts 의 문장을 보인다. */
export const PUBLISH_ERRORS = [
	'file_write_failed',
	'file_conflict',
	'content_invalid',
	'content_changed'
] as const;
export type PublishError = (typeof PUBLISH_ERRORS)[number];

/** 다음 판을 지금 만들면 생길 구성(마지막 공개본 대비, D-30). */
export type NextVersion = {
	next_version_no: number;
	row_count: number;
	/** 최신 기록본에도 있던 줄 */
	carried: number;
	/** 최신 기록본에 없던 줄(바뀌는 줄 포함) */
	added: number;
	/** 같은 구분 칸의 더 최근 승인 줄로 바뀌는 줄 */
	replaced: number;
	excluded: number;
	/** 최신 기록본에 있었지만 빠지는 줄 */
	removed: number;
	unchanged: boolean;
};

export type VersionEntry = {
	version_no: number;
	schema_version: number;
	row_count: number;
	note: string | null;
	created_at: string;
	status: PublishStatus;
	/** 공개 경로(/data/datasets/{slug}/v{n}.json) */
	path: string;
	published_at: string | null;
	publish_error: PublishError | null;
	/** 조회 시점에 공개 파일이 있는가(저장값 아님). 폐기 판의 남은 파일 · 공개 판의 사라진 파일 경고에 쓴다. */
	file_present: boolean;
};

/** 이 묶음을 쓰는 이야기와 그 이야기가 가리키는 판 번호 · 그 판의 상태(조회 시점). */
export type StoryUse = {
	story: string;
	title: string;
	version: number;
	version_status: ReferencedVersionStatus;
};

export type VersionHistory = {
	versions: VersionEntry[];
	used_by: StoryUse[];
	/** 읽지 못해 건너뛴 이야기 파일 수 */
	skipped_story_files: number;
	/** 판 번호가 맞지 않아 건너뛴 이 묶음 항목 수 */
	skipped_references: number;
};

export type PublishOutcome = {
	version_no: number;
	status: PublishStatus;
	path: string;
	row_count: number;
	published_at: string | null;
	publish_error: PublishError | null;
	file_present: boolean;
	used_by: StoryUse[];
};

export type FetchNextResult =
	{ kind: 'ok'; next: NextVersion } | { kind: 'not_found' } | CommonFailure;
export type FetchHistoryResult =
	{ kind: 'ok'; history: VersionHistory } | { kind: 'not_found' } | CommonFailure;
/** blocked: 서버가 409 로 막음(화면 상태가 오래되었을 수 있어 다시 읽는다). */
export type BlockedReason =
	| 'empty'
	| 'unchanged'
	| 'incomplete'
	| 'content_invalid'
	| 'file_missing'
	| 'content_changed'
	| 'not_abandonable'
	| 'abandoned'
	| 'conflict';
export type PublishResult =
	| { kind: 'ok'; outcome: PublishOutcome }
	| { kind: 'blocked'; reason: BlockedReason }
	| { kind: 'not_found' }
	| CommonFailure;

const NUMBER_KEYS_OF_NEXT = [
	'next_version_no',
	'row_count',
	'carried',
	'added',
	'replaced',
	'excluded',
	'removed'
] as const satisfies readonly (keyof NextVersion)[];

const STATUS_OK = 200;
const STATUS_CREATED = 201;

function datasetPath(slug: string): string {
	return `/datasets/${encodeURIComponent(slug)}`;
}

function isPublishStatus(value: unknown): value is PublishStatus {
	return PUBLISH_STATUSES.some((status) => status === value);
}

function isReferencedVersionStatus(value: unknown): value is ReferencedVersionStatus {
	return value === MISSING_VERSION_STATUS || isPublishStatus(value);
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isNullablePublishError(value: unknown): value is PublishError | null {
	return value === null || PUBLISH_ERRORS.some((code) => code === value);
}

function isNextVersion(value: unknown): value is NextVersion {
	return (
		isObject(value) &&
		NUMBER_KEYS_OF_NEXT.every((key) => typeof value[key] === 'number') &&
		typeof value.unchanged === 'boolean'
	);
}

function isVersionEntry(value: unknown): value is VersionEntry {
	return (
		isObject(value) &&
		typeof value.version_no === 'number' &&
		typeof value.schema_version === 'number' &&
		typeof value.row_count === 'number' &&
		isNullableString(value.note) &&
		typeof value.created_at === 'string' &&
		isPublishStatus(value.status) &&
		typeof value.path === 'string' &&
		isNullableString(value.published_at) &&
		isNullablePublishError(value.publish_error) &&
		typeof value.file_present === 'boolean'
	);
}

function isStoryUse(value: unknown): value is StoryUse {
	return (
		isObject(value) &&
		typeof value.story === 'string' &&
		typeof value.title === 'string' &&
		typeof value.version === 'number' &&
		isReferencedVersionStatus(value.version_status)
	);
}

function isVersionHistory(value: unknown): value is VersionHistory {
	return (
		isObject(value) &&
		Array.isArray(value.versions) &&
		value.versions.every(isVersionEntry) &&
		Array.isArray(value.used_by) &&
		value.used_by.every(isStoryUse) &&
		typeof value.skipped_story_files === 'number' &&
		typeof value.skipped_references === 'number'
	);
}

function isPublishOutcome(value: unknown): value is PublishOutcome {
	return (
		isObject(value) &&
		typeof value.version_no === 'number' &&
		isPublishStatus(value.status) &&
		typeof value.path === 'string' &&
		typeof value.row_count === 'number' &&
		isNullableString(value.published_at) &&
		isNullablePublishError(value.publish_error) &&
		typeof value.file_present === 'boolean' &&
		Array.isArray(value.used_by) &&
		value.used_by.every(isStoryUse)
	);
}

export async function fetchNextVersion(slug: string): Promise<FetchNextResult> {
	const response = await request(`${datasetPath(slug)}/versions/next`);
	if (response === null) return commonFailure(response);
	if (response.status === 404) return { kind: 'not_found' };
	if (response.status !== STATUS_OK) return commonFailure(response);
	const next = await readBody(response, isNextVersion);
	return next === null ? { kind: 'unexpected' } : { kind: 'ok', next };
}

export async function fetchVersionHistory(slug: string): Promise<FetchHistoryResult> {
	const response = await request(`${datasetPath(slug)}/versions`);
	if (response === null) return commonFailure(response);
	if (response.status === 404) return { kind: 'not_found' };
	if (response.status !== STATUS_OK) return commonFailure(response);
	const history = await readBody(response, isVersionHistory);
	return history === null ? { kind: 'unexpected' } : { kind: 'ok', history };
}

async function readPublished(response: Response | null, okStatus: number): Promise<PublishResult> {
	if (response === null) return commonFailure(response);
	if (response.status === okStatus) {
		const outcome = await readBody(response, isPublishOutcome);
		return outcome === null ? { kind: 'unexpected' } : { kind: 'ok', outcome };
	}
	if (response.status === 404) return { kind: 'not_found' };
	if (response.status !== 409) return commonFailure(response);
	const detail = await readErrorDetail(response);
	switch (detail === null ? null : detail.code) {
		case 'publish_empty':
			return { kind: 'blocked', reason: 'empty' };
		case 'publish_unchanged':
			return { kind: 'blocked', reason: 'unchanged' };
		case 'publish_incomplete':
			return { kind: 'blocked', reason: 'incomplete' };
		case 'publish_content_invalid':
			return { kind: 'blocked', reason: 'content_invalid' };
		case 'publish_file_missing':
			return { kind: 'blocked', reason: 'file_missing' };
		case 'content_changed':
			return { kind: 'blocked', reason: 'content_changed' };
		case 'version_not_abandonable':
			return { kind: 'blocked', reason: 'not_abandonable' };
		case 'version_abandoned':
			return { kind: 'blocked', reason: 'abandoned' };
		default:
			// version_conflict · concurrent_change: 다른 처리와 겹쳤다.
			return { kind: 'blocked', reason: 'conflict' };
	}
}

/** 다음 판 기록본을 만들고 공개 파일을 쓴다. 파일 쓰기 실패도 ok(outcome.status failed)로 돌아온다. */
export async function publishDataset(slug: string): Promise<PublishResult> {
	const response = await request(`${datasetPath(slug)}/publish`, { method: 'POST' });
	return readPublished(response, STATUS_CREATED);
}

/** 끝나지 않은(pending · failed) 판의 공개 파일을 다시 쓴다. done 이면 파일이 있을 때 그대로, 없으면 같은 바이트로 복구한다(못 하면 409). */
export async function retryPublish(slug: string, versionNo: number): Promise<PublishResult> {
	const response = await request(`${datasetPath(slug)}/versions/${versionNo}/publish`, {
		method: 'POST'
	});
	return readPublished(response, STATUS_OK);
}

/** 끝나지 않은(pending · failed) 판을 폐기한다. 번호는 다시 쓰지 않고 줄 · 파일은 그대로 둔다(D-30). */
export async function abandonVersion(slug: string, versionNo: number): Promise<PublishResult> {
	const response = await request(`${datasetPath(slug)}/versions/${versionNo}/abandon`, {
		method: 'POST'
	});
	return readPublished(response, STATUS_OK);
}
