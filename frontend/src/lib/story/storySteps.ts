// 모든 스토리 단계가 공통으로 갖는 항목(단계 이름·제목·이야기·문구 출처·곁들임 카드·그림)과 그 해석(순수 함수).
// 스토리마다 단계 정의는 StoryStepBase 에 전용 항목을 더해 만든다.

// 단계 곁들임 카드: fact 는 출처로 확인되는 사실, legend 는 전해지는 이야기(사실 여부가 분명하지 않음)
export const ASIDE_KINDS = ['fact', 'legend'] as const;
export type AsideKind = (typeof ASIDE_KINDS)[number];

export type StepAside = {
	kind: AsideKind;
	text: string;
	// copySources[].id 참조
	sources: string[];
	// 이미지 목록(images.json)의 id. 없으면 null.
	image: string | null;
};

// 단계 카드 위쪽 그림: image 는 이미지 목록의 id, svg 는 코드로 그린 연출의 id
export const MEDIA_TYPES = ['image', 'svg'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export type StepMedia = { type: MediaType; id: string };

export type StoryStepBase = {
	id: string;
	label: string;
	title: string;
	body: string;
	// copySources[].id 참조
	sources: string[];
	aside: StepAside | null;
	media: StepMedia | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new Error(`step ${field} must be a string`);
	return value;
}

// 생략한 목록은 빈 목록으로 본다.
function stringList(value: unknown, field: string): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
		throw new Error(`step ${field} must be a string list`);
	}
	return value;
}

function isAsideKind(value: unknown): value is AsideKind {
	return ASIDE_KINDS.some((kind) => kind === value);
}

function isMediaType(value: unknown): value is MediaType {
	return MEDIA_TYPES.some((type) => type === value);
}

function parseAside(raw: unknown): StepAside | null {
	if (raw === undefined) return null;
	if (!isRecord(raw)) throw new Error('step aside must be an object');
	if (!isAsideKind(raw.kind)) throw new Error(`unknown step aside kind: ${String(raw.kind)}`);
	return {
		kind: raw.kind,
		text: requireString(raw.text, 'aside.text'),
		sources: stringList(raw.sources, 'aside.sources'),
		image: raw.image === undefined ? null : requireString(raw.image, 'aside.image')
	};
}

function parseMedia(raw: unknown): StepMedia | null {
	if (raw === undefined) return null;
	if (!isRecord(raw)) throw new Error('step media must be an object');
	if (!isMediaType(raw.type)) throw new Error(`unknown step media type: ${String(raw.type)}`);
	return { type: raw.type, id: requireString(raw.id, 'media.id') };
}

/** 구성 JSON 의 단계 1개에서 공통 항목을 읽는다. 형식이 다르면 빌드·첫 실행에서 바로 드러나도록 예외. */
export function parseStoryStepBase(raw: unknown): StoryStepBase {
	if (!isRecord(raw)) throw new Error('step must be an object');
	return {
		id: requireString(raw.id, 'id'),
		label: requireString(raw.label, 'label'),
		title: requireString(raw.title, 'title'),
		body: requireString(raw.body, 'body'),
		sources: stringList(raw.sources, 'sources'),
		aside: parseAside(raw.aside),
		media: parseMedia(raw.media)
	};
}
