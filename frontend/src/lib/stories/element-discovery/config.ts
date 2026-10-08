// 원소 발견사 스토리 구성(문구·문구 출처·퀴즈·막대·출생 연도) 해석(순수 함수).
import { parseCopySource, type CopySource } from '../../story/storyConfig.ts';
import { parseSteps, type StepDefinition } from './steps.ts';

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
