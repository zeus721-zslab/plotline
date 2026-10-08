// 시그니처 장면 단계 판정(순수 함수). 단계 정의는 element-discovery.config.json(D-05)에서 읽는다.
import { compareByDiscovery, type StoryElement } from './elements.ts';

// ancient: 고대 원소만 · year: 고대 + 그 해까지 발견 · all: 전부
export type StepUntil = { kind: 'ancient' } | { kind: 'year'; year: number } | { kind: 'all' };

// 강조 칸: 고대 원소 전체 또는 원자 번호 목록
export type StepHighlight = { kind: 'ancient' } | { kind: 'numbers'; numbers: number[] };

// 문구 속 연도를 데이터와 대조할 항목
export type YearCheck = { atomicNumber: number; year: number };

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

export type StepDefinition = {
	id: string;
	label: string;
	until: StepUntil;
	highlight: StepHighlight;
	title: string;
	body: string;
	// copySources[].id 참조
	sources: string[];
	checks: YearCheck[];
	mustBeAncient: number[];
	// 강조 칩에 보일 원자 번호 순서. 생략하면 기존 규칙(강조 칸 중 원자 번호순 앞 6개)을 따른다.
	chips: number[];
	// 아직 발견되지 않아 "?" 로 깜박이는 칸
	predicted: number[];
	// 강조 칸을 발견 연도순으로 하나씩 켠다
	revealInOrder: boolean;
	aside: StepAside | null;
	media: StepMedia | null;
};

export type StepSummary = {
	step: StepDefinition;
	knownNumbers: Set<number>;
	highlightNumbers: number[];
	// 직전 단계 이후 새로 알려진 원소(발견 순서). 첫 단계는 그 단계의 원소 전부.
	added: StoryElement[];
};

const ALL_ELEMENTS_MARKER = 'all';
const ANCIENT_HIGHLIGHT_MARKER = 'ancient';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new Error(`step ${field} must be a string`);
	return value;
}

// 생략한 목록은 빈 목록으로 본다.
function integerList(value: unknown, field: string): number[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || !value.every(isInteger)) {
		throw new Error(`step ${field} must be an integer list`);
	}
	return value;
}

function stringList(value: unknown, field: string): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
		throw new Error(`step ${field} must be a string list`);
	}
	return value;
}

function parseUntil(raw: unknown): StepUntil {
	if (raw === null) return { kind: 'ancient' };
	if (raw === ALL_ELEMENTS_MARKER) return { kind: 'all' };
	if (isInteger(raw)) return { kind: 'year', year: raw };
	throw new Error(`unknown step until value: ${String(raw)}`);
}

function parseHighlight(raw: unknown): StepHighlight {
	if (raw === ANCIENT_HIGHLIGHT_MARKER) return { kind: 'ancient' };
	return { kind: 'numbers', numbers: integerList(raw, 'highlight') };
}

function parseChecks(raw: unknown): YearCheck[] {
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) throw new Error('step checks must be a list');
	return raw.map((pair: unknown) => {
		if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(isInteger)) {
			throw new Error('step check must be [atomic number, year]');
		}
		return { atomicNumber: pair[0], year: pair[1] };
	});
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

function parseStep(raw: unknown): StepDefinition {
	if (!isRecord(raw)) throw new Error('step must be an object');
	return {
		id: requireString(raw.id, 'id'),
		label: requireString(raw.label, 'label'),
		until: parseUntil(raw.until),
		highlight: parseHighlight(raw.highlight),
		title: requireString(raw.title, 'title'),
		body: requireString(raw.body, 'body'),
		sources: stringList(raw.sources, 'sources'),
		checks: parseChecks(raw.checks),
		mustBeAncient: integerList(raw.mustBeAncient, 'mustBeAncient'),
		chips: integerList(raw.chips, 'chips'),
		predicted: integerList(raw.predicted, 'predicted'),
		revealInOrder: raw.revealInOrder === true,
		aside: parseAside(raw.aside),
		media: parseMedia(raw.media)
	};
}

/** 구성 JSON 의 steps 배열을 단계 정의로 바꾼다. 형식이 다르면 빌드·첫 실행에서 바로 드러나도록 예외. */
export function parseSteps(raw: readonly unknown[]): StepDefinition[] {
	return raw.map(parseStep);
}

export function isKnownAt(element: StoryElement, until: StepUntil): boolean {
	switch (until.kind) {
		case 'ancient':
			return element.discovery.era === 'ancient';
		case 'year':
			return element.discovery.era === 'ancient' || element.discovery.year <= until.year;
		case 'all':
			return true;
	}
}

export function highlightNumbers(elements: StoryElement[], highlight: StepHighlight): number[] {
	if (highlight.kind === 'numbers') return highlight.numbers;
	return elements
		.filter((element) => element.discovery.era === 'ancient')
		.map((element) => element.atomicNumber);
}

export function summarizeSteps(elements: StoryElement[], steps: StepDefinition[]): StepSummary[] {
	let previous = new Set<number>();
	return steps.map((step) => {
		const known = elements.filter((element) => isKnownAt(element, step.until));
		const added = known
			.filter((element) => !previous.has(element.atomicNumber))
			.sort(compareByDiscovery);
		const knownNumbers = new Set(known.map((element) => element.atomicNumber));
		previous = knownNumbers;
		return {
			step,
			knownNumbers,
			highlightNumbers: highlightNumbers(elements, step.highlight),
			added
		};
	});
}
