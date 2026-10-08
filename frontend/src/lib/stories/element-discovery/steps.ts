// 시그니처 장면 단계 판정(순수 함수). 단계 정의는 element-discovery.config.json(D-05)에서 읽는다.
import { parseStoryStepBase, type StoryStepBase } from '../../story/storySteps.ts';
import { compareByDiscovery, type StoryElement } from './elements.ts';

// ancient: 고대 원소만 · year: 고대 + 그 해까지 발견 · all: 전부
export type StepUntil = { kind: 'ancient' } | { kind: 'year'; year: number } | { kind: 'all' };

// 강조 칸: 고대 원소 전체 또는 원자 번호 목록
export type StepHighlight = { kind: 'ancient' } | { kind: 'numbers'; numbers: number[] };

// 문구 속 연도를 데이터와 대조할 항목
export type YearCheck = { atomicNumber: number; year: number };

// 공통 단계 항목에 원소 발견사 전용 항목(판정 시점·강조 칸·대조·칩·예언 칸·순차 켜짐)을 더한다.
export type StepDefinition = StoryStepBase & {
	until: StepUntil;
	highlight: StepHighlight;
	checks: YearCheck[];
	mustBeAncient: number[];
	// 강조 칩에 보일 원자 번호 순서. 생략하면 기존 규칙(강조 칸 중 원자 번호순 앞 6개)을 따른다.
	chips: number[];
	// 아직 발견되지 않아 "?" 로 깜박이는 칸
	predicted: number[];
	// 강조 칸을 발견 연도순으로 하나씩 켠다
	revealInOrder: boolean;
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

// 생략한 목록은 빈 목록으로 본다.
function integerList(value: unknown, field: string): number[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || !value.every(isInteger)) {
		throw new Error(`step ${field} must be an integer list`);
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

function parseStep(raw: unknown): StepDefinition {
	if (!isRecord(raw)) throw new Error('step must be an object');
	return {
		...parseStoryStepBase(raw),
		until: parseUntil(raw.until),
		highlight: parseHighlight(raw.highlight),
		checks: parseChecks(raw.checks),
		mustBeAncient: integerList(raw.mustBeAncient, 'mustBeAncient'),
		chips: integerList(raw.chips, 'chips'),
		predicted: integerList(raw.predicted, 'predicted'),
		revealInOrder: raw.revealInOrder === true
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
