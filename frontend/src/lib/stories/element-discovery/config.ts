// 원소 발견사 스토리 구성(문구·문구 출처·막대) 해석(순수 함수).
import { parseCopySource, type CopySource } from '../../story/storyConfig.ts';
import { parseSteps, type StepDefinition } from './steps.ts';

export type BarsConfig = { title: string; body: string };

export type StoryConfig = {
	copySources: CopySource[];
	steps: StepDefinition[];
	bars: BarsConfig;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`story config ${field} must be an object`);
	return value;
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new Error(`story config ${field} must be a string`);
	return value;
}

function requireList(value: unknown, field: string): unknown[] {
	if (!Array.isArray(value)) throw new Error(`story config ${field} must be a list`);
	return value;
}

function parseBars(raw: unknown): BarsConfig {
	const record = requireRecord(raw, 'bars');
	return {
		title: requireString(record.title, 'bars.title'),
		body: requireString(record.body, 'bars.body')
	};
}

/** 구성 JSON 을 해석한다. 형식이 다르면 빌드·첫 실행에서 바로 드러나도록 예외. */
export function parseStoryConfig(raw: unknown): StoryConfig {
	const record = requireRecord(raw, 'root');
	return {
		copySources: requireList(record.copySources, 'copySources').map(parseCopySource),
		steps: parseSteps(requireList(record.steps, 'steps')),
		bars: parseBars(record.bars)
	};
}
