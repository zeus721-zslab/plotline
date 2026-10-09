// 이야기 등록 · 발행 · 되돌리기 관리자 API 호출(D-37). 결과 타입 · 가드 방식은 datasets.ts · publish.ts 와 같다.

import { readJson, request } from './api.ts';
import {
	commonFailure,
	isObject,
	readBody,
	readErrorDetail,
	type CommonFailure
} from './datasets.ts';
import { PUBLISH_STATUSES, type PublishStatus } from './publish.ts';

/** 서버 이야기 발행 실패 코드(admin_stories/service.py)의 단일 소스. 화면은 terms.ts 의 문장을 보인다. */
export const STORY_PUBLISH_ERRORS = [
	'publish_dir_missing',
	'unsafe_path',
	'story_file_write_failed',
	'index_write_failed'
] as const;
export type StoryPublishError = (typeof STORY_PUBLISH_ERRORS)[number];

/** 공개 이야기 파일 상태(서버 publishing/story_file.py PublicFileStatus)의 단일 소스. */
export const PUBLIC_FILE_STATUSES = ['ok', 'missing', 'mismatch', 'unreadable'] as const;
export type PublicFileStatus = (typeof PUBLIC_FILE_STATUSES)[number];

/** 판 내용 API 가 내용을 주지 못한 이유(서버 detail.code). 화면은 terms.ts 의 문장을 보인다. */
export const DATASET_CONTENT_PROBLEMS = [
	'content_invalid',
	'version_not_done',
	'dataset_not_found',
	'version_not_found'
] as const;
export type DatasetContentProblem = (typeof DATASET_CONTENT_PROBLEMS)[number];

export type StoryVersion = {
	version_no: number;
	status: PublishStatus;
	title: string;
	summary: string;
	/** 묶음 주소 이름 → 데이터 판 번호 */
	datasets: Record<string, number>;
	published_at: string | null;
	publish_error: StoryPublishError | null;
	created_at: string;
};

export type DoneDatasetVersion = { version_no: number; file_present: boolean };

export type StoryDataset = {
	name: string;
	/** 공개된 판, 큰 번호부터 */
	done_versions: DoneDatasetVersion[];
	/** 이야기의 최신 공개 판이 쓰는 판 번호 */
	current_version: number | null;
	/** 이 묶음의 최신 공개 판이 이야기의 현재 판보다 새로움 */
	newer_than_current: boolean;
};

export type StorySummary = {
	story: string;
	latest_version_no: number | null;
	latest_status: PublishStatus | null;
	latest_done: StoryVersion | null;
	datasets: StoryDataset[];
	/** 공개 이야기 파일이 최신 공개 판과 맞는가(공개 판이 없으면 null) */
	public_file: PublicFileStatus | null;
};

export type StoryDetail = StorySummary & { versions: StoryVersion[] };

export type StoryPublishOutcome = {
	story: string;
	version_no: number;
	status: PublishStatus;
	published_at: string | null;
	publish_error: StoryPublishError | null;
};

/** 공개 파일 다시 쓰기 결과. write_error 가 있어도 판 상태는 done 그대로다. */
export type StoryRewriteOutcome = {
	story: string;
	version_no: number;
	published_at: string;
	write_error: StoryPublishError | null;
};

export type ListStoriesResult = { kind: 'ok'; stories: StorySummary[] } | CommonFailure;
export type FetchStoryResult =
	{ kind: 'ok'; story: StoryDetail } | { kind: 'not_found' } | CommonFailure;
/** blocked: 서버가 막음(화면 상태가 오래되었을 수 있어 다시 읽는다). problems 는 어떤 묶음 판이 문제인지. */
export type StoryBlockedReason =
	| 'unchanged'
	| 'incomplete'
	| 'datasets_mismatch'
	| 'dataset_version_not_done'
	| 'dataset_file_missing'
	| 'not_retryable'
	| 'not_restorable'
	| 'not_rewritable'
	| 'conflict';
export type StoryPublishResult =
	| { kind: 'ok'; outcome: StoryPublishOutcome }
	| { kind: 'blocked'; reason: StoryBlockedReason; problems: string[] }
	| { kind: 'not_found' }
	| CommonFailure;
export type StoryRewriteResult =
	| { kind: 'ok'; outcome: StoryRewriteOutcome }
	| { kind: 'blocked'; reason: StoryBlockedReason; problems: string[] }
	| { kind: 'not_found' }
	| CommonFailure;
/** 판 내용(발행 파일과 같은 JSON). problem: 서버가 404 · 409 와 함께 알려 준 이유. */
export type DatasetContentResult =
	| { kind: 'ok'; content: unknown }
	| { kind: 'problem'; problem: DatasetContentProblem }
	| CommonFailure;

const STORIES_PATH = '/stories';
const STATUS_OK = 200;
const STATUS_CREATED = 201;
const STATUS_UNPROCESSABLE = 422;
const STATUS_NOT_FOUND = 404;
const STATUS_CONFLICT = 409;

function storyPath(story: string): string {
	return `${STORIES_PATH}/${encodeURIComponent(story)}`;
}

function isPublishStatus(value: unknown): value is PublishStatus {
	return PUBLISH_STATUSES.some((status) => status === value);
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
	return value === null || typeof value === 'number';
}

function isNullableStoryPublishError(value: unknown): value is StoryPublishError | null {
	return value === null || STORY_PUBLISH_ERRORS.some((code) => code === value);
}

function isNullablePublicFileStatus(value: unknown): value is PublicFileStatus | null {
	return value === null || PUBLIC_FILE_STATUSES.some((status) => status === value);
}

function isVersionMap(value: unknown): value is Record<string, number> {
	return isObject(value) && Object.values(value).every((item) => typeof item === 'number');
}

function isStoryVersion(value: unknown): value is StoryVersion {
	return (
		isObject(value) &&
		typeof value.version_no === 'number' &&
		isPublishStatus(value.status) &&
		typeof value.title === 'string' &&
		typeof value.summary === 'string' &&
		isVersionMap(value.datasets) &&
		isNullableString(value.published_at) &&
		isNullableStoryPublishError(value.publish_error) &&
		typeof value.created_at === 'string'
	);
}

function isDoneDatasetVersion(value: unknown): value is DoneDatasetVersion {
	return (
		isObject(value) &&
		typeof value.version_no === 'number' &&
		typeof value.file_present === 'boolean'
	);
}

function isStoryDataset(value: unknown): value is StoryDataset {
	return (
		isObject(value) &&
		typeof value.name === 'string' &&
		Array.isArray(value.done_versions) &&
		value.done_versions.every(isDoneDatasetVersion) &&
		isNullableNumber(value.current_version) &&
		typeof value.newer_than_current === 'boolean'
	);
}

function isStorySummary(value: unknown): value is StorySummary {
	return (
		isObject(value) &&
		typeof value.story === 'string' &&
		isNullableNumber(value.latest_version_no) &&
		(value.latest_status === null || isPublishStatus(value.latest_status)) &&
		(value.latest_done === null || isStoryVersion(value.latest_done)) &&
		Array.isArray(value.datasets) &&
		value.datasets.every(isStoryDataset) &&
		isNullablePublicFileStatus(value.public_file)
	);
}

function isStoryDetail(value: unknown): value is StoryDetail {
	return (
		isStorySummary(value) &&
		'versions' in value &&
		Array.isArray(value.versions) &&
		value.versions.every(isStoryVersion)
	);
}

function isStoryPublishOutcome(value: unknown): value is StoryPublishOutcome {
	return (
		isObject(value) &&
		typeof value.story === 'string' &&
		typeof value.version_no === 'number' &&
		isPublishStatus(value.status) &&
		isNullableString(value.published_at) &&
		isNullableStoryPublishError(value.publish_error)
	);
}

function isStoryRewriteOutcome(value: unknown): value is StoryRewriteOutcome {
	return (
		isObject(value) &&
		typeof value.story === 'string' &&
		typeof value.version_no === 'number' &&
		typeof value.published_at === 'string' &&
		isNullableStoryPublishError(value.write_error)
	);
}

function sameDatasets(left: Record<string, number>, right: Record<string, number>): boolean {
	const names = Object.keys(right);
	return (
		Object.keys(left).length === names.length && names.every((name) => left[name] === right[name])
	);
}

/**
 * 최신 판이 공개된(done) 판이고 그 내용(제목 · 요약 · 데이터 판)과 같은가. 발행 버튼 · 되돌리기 버튼이 함께 쓴다.
 * 최신 판이 실패(failed)면 공개 파일이 그 판 내용일 수 있어 같은 내용으로 보지 않는다(서버 _publish_content 와 같은 규칙).
 */
export function sameAsPublished(
	story: StorySummary,
	content: { title: string; summary: string; datasets: Record<string, number> }
): boolean {
	const current = story.latest_done;
	return (
		story.latest_status === 'done' &&
		current !== null &&
		current.version_no === story.latest_version_no &&
		current.title === content.title &&
		current.summary === content.summary &&
		sameDatasets(current.datasets, content.datasets)
	);
}

export async function listStories(): Promise<ListStoriesResult> {
	const response = await request(STORIES_PATH);
	if (response === null || response.status !== STATUS_OK) return commonFailure(response);
	const stories = await readBody(response, (value): value is StorySummary[] => {
		return Array.isArray(value) && value.every(isStorySummary);
	});
	return stories === null ? { kind: 'unexpected' } : { kind: 'ok', stories };
}

export async function fetchStory(story: string): Promise<FetchStoryResult> {
	const response = await request(storyPath(story));
	if (response === null) return commonFailure(response);
	if (response.status === STATUS_NOT_FOUND) return { kind: 'not_found' };
	if (response.status !== STATUS_OK) return commonFailure(response);
	const detail = await readBody(response, isStoryDetail);
	return detail === null ? { kind: 'unexpected' } : { kind: 'ok', story: detail };
}

function blockedReason(code: string | null): StoryBlockedReason {
	switch (code) {
		case 'publish_unchanged':
			return 'unchanged';
		case 'publish_incomplete':
			return 'incomplete';
		case 'datasets_mismatch':
			return 'datasets_mismatch';
		case 'dataset_version_not_done':
			return 'dataset_version_not_done';
		case 'dataset_file_missing':
			return 'dataset_file_missing';
		case 'version_not_retryable':
			return 'not_retryable';
		case 'version_not_restorable':
			return 'not_restorable';
		case 'version_not_rewritable':
			return 'not_rewritable';
		default:
			// concurrent_change 등: 다른 처리와 겹쳤다.
			return 'conflict';
	}
}

type BlockedOrFailure =
	| { kind: 'blocked'; reason: StoryBlockedReason; problems: string[] }
	| { kind: 'not_found' }
	| CommonFailure;

async function readPublished(
	response: Response | null,
	okStatus: number
): Promise<StoryPublishResult> {
	if (response === null) return commonFailure(response);
	if (response.status === okStatus) {
		const outcome = await readBody(response, isStoryPublishOutcome);
		return outcome === null ? { kind: 'unexpected' } : { kind: 'ok', outcome };
	}
	return readBlocked(response);
}

async function readBlocked(response: Response): Promise<BlockedOrFailure> {
	if (response.status === STATUS_NOT_FOUND) return { kind: 'not_found' };
	// 422 는 묶음 이름 불일치(도메인 오류)일 때만 detail.code 가 있다. 형식 오류(detail 배열)는 예상 밖으로 본다.
	if (response.status !== STATUS_CONFLICT && response.status !== STATUS_UNPROCESSABLE) {
		return commonFailure(response);
	}
	const detail = await readErrorDetail(response);
	if (detail === null) return { kind: 'unexpected' };
	return {
		kind: 'blocked',
		reason: blockedReason(detail.code),
		problems: detail.problems === null ? [] : detail.problems
	};
}

/** 새 판을 만들고 이야기 파일 · 목록을 교체한다. 파일 쓰기 실패도 ok(outcome.status failed)로 돌아온다. */
export async function publishStory(
	story: string,
	title: string,
	summary: string,
	datasets: Record<string, number>
): Promise<StoryPublishResult> {
	const response = await request(`${storyPath(story)}/publish`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ title, summary, datasets })
	});
	return readPublished(response, STATUS_CREATED);
}

/** 가장 최근의 실패한 판을 같은 내용으로 다시 쓴다. */
export async function retryStory(story: string, versionNo: number): Promise<StoryPublishResult> {
	const response = await request(`${storyPath(story)}/versions/${versionNo}/retry`, {
		method: 'POST'
	});
	return readPublished(response, STATUS_OK);
}

/** 공개됐던 판의 내용으로 새 판을 발행한다. */
export async function restoreStory(story: string, versionNo: number): Promise<StoryPublishResult> {
	const response = await request(`${storyPath(story)}/versions/${versionNo}/restore`, {
		method: 'POST'
	});
	return readPublished(response, STATUS_CREATED);
}

/** 최신 공개(done) 판 내용으로 이야기 파일 · 목록을 다시 쓴다(판 상태 무변경). 쓰기 실패도 ok(outcome.write_error). */
export async function rewriteStory(story: string): Promise<StoryRewriteResult> {
	const response = await request(`${storyPath(story)}/rewrite`, { method: 'POST' });
	if (response === null) return commonFailure(response);
	if (response.status === STATUS_OK) {
		const outcome = await readBody(response, isStoryRewriteOutcome);
		return outcome === null ? { kind: 'unexpected' } : { kind: 'ok', outcome };
	}
	return readBlocked(response);
}

function contentProblem(code: string | null): DatasetContentProblem | null {
	const found = DATASET_CONTENT_PROBLEMS.find((problem) => problem === code);
	return found === undefined ? null : found;
}

/** 공개된 데이터 판의 내용(발행 파일과 같은 JSON). 형식 확인은 쓰는 쪽이 한다(문구 대조 · 미리보기). */
export async function fetchDatasetContent(
	slug: string,
	versionNo: number
): Promise<DatasetContentResult> {
	const response = await request(
		`/datasets/${encodeURIComponent(slug)}/versions/${versionNo}/content`
	);
	if (response === null) return commonFailure(response);
	if (response.status === STATUS_NOT_FOUND || response.status === STATUS_CONFLICT) {
		const detail = await readErrorDetail(response);
		const problem = contentProblem(detail === null ? null : detail.code);
		return problem === null ? { kind: 'unexpected' } : { kind: 'problem', problem };
	}
	if (response.status !== STATUS_OK) return commonFailure(response);
	const parsed = await readJson(response);
	return parsed.kind === 'invalid_json'
		? { kind: 'unexpected' }
		: { kind: 'ok', content: parsed.body };
}
