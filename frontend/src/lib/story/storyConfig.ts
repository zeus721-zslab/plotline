// 원소 발견사 스토리 구성(문구·문구 출처·퀴즈·막대·출생 연도) 해석(순수 함수).
// 문구 속 {이름} 자리는 화면이 데이터로 계산한 값으로 채운다(fillTemplate).
import { parseSteps, type StepDefinition } from './steps.ts';

export type CopySource = { id: string; title: string; url: string };

export type QuizConfig = { question: string; choices: number[]; answer: string };

export type BarsConfig = { title: string; body: string };

export type BirthYearConfig = { title: string; minYear: number; result: string };

export type StoryConfig = {
	copySources: CopySource[];
	quiz: QuizConfig;
	steps: StepDefinition[];
	bars: BarsConfig;
	birthYear: BirthYearConfig;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`story config ${field} must be an object`);
	return value;
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new Error(`story config ${field} must be a string`);
	return value;
}

function requireInteger(value: unknown, field: string): number {
	if (!isInteger(value)) throw new Error(`story config ${field} must be an integer`);
	return value;
}

function requireList(value: unknown, field: string): unknown[] {
	if (!Array.isArray(value)) throw new Error(`story config ${field} must be a list`);
	return value;
}

function parseCopySource(raw: unknown): CopySource {
	const record = requireRecord(raw, 'copySources[]');
	return {
		id: requireString(record.id, 'copySources[].id'),
		title: requireString(record.title, 'copySources[].title'),
		url: requireString(record.url, 'copySources[].url')
	};
}

function parseQuiz(raw: unknown): QuizConfig {
	const record = requireRecord(raw, 'quiz');
	return {
		question: requireString(record.question, 'quiz.question'),
		choices: requireList(record.choices, 'quiz.choices').map((choice) =>
			requireInteger(choice, 'quiz.choices[]')
		),
		answer: requireString(record.answer, 'quiz.answer')
	};
}

function parseBars(raw: unknown): BarsConfig {
	const record = requireRecord(raw, 'bars');
	return {
		title: requireString(record.title, 'bars.title'),
		body: requireString(record.body, 'bars.body')
	};
}

function parseBirthYear(raw: unknown): BirthYearConfig {
	const record = requireRecord(raw, 'birthYear');
	return {
		title: requireString(record.title, 'birthYear.title'),
		minYear: requireInteger(record.minYear, 'birthYear.minYear'),
		result: requireString(record.result, 'birthYear.result')
	};
}

/** 구성 JSON 을 해석한다. 형식이 다르면 빌드·첫 실행에서 바로 드러나도록 예외. */
export function parseStoryConfig(raw: unknown): StoryConfig {
	const record = requireRecord(raw, 'root');
	return {
		copySources: requireList(record.copySources, 'copySources').map(parseCopySource),
		quiz: parseQuiz(record.quiz),
		steps: parseSteps(requireList(record.steps, 'steps')),
		bars: parseBars(record.bars),
		birthYear: parseBirthYear(record.birthYear)
	};
}

const TEMPLATE_SLOT = /\{(\w+)\}/g;

/** 문구의 {이름} 자리를 값으로 바꾼다. 값이 없는 자리는 화면에서 눈에 띄도록 그대로 둔다. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
	return template.replace(TEMPLATE_SLOT, (slot: string, name: string) =>
		name in values ? String(values[name]) : slot
	);
}

export type TemplatePart = { kind: 'text'; text: string } | { kind: 'slot'; name: string };

/** 문구를 글자 조각과 {이름} 자리로 나눈다. 자리마다 다른 표현(숫자 세기 등)을 끼울 때 쓴다. */
export function templateParts(template: string): TemplatePart[] {
	const parts: TemplatePart[] = [];
	let cursor = 0;
	for (const match of template.matchAll(TEMPLATE_SLOT)) {
		if (match.index > cursor)
			parts.push({ kind: 'text', text: template.slice(cursor, match.index) });
		parts.push({ kind: 'slot', name: match[1] });
		cursor = match.index + match[0].length;
	}
	if (cursor < template.length) parts.push({ kind: 'text', text: template.slice(cursor) });
	return parts;
}
