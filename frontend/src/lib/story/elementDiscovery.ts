// 원소 발견사 스토리 데이터 불러오기: 스토리 파일 → 두 데이터셋 → 원소 목록.
import config from './element-discovery.config.json';
import {
	buildElements,
	datasetSourceViews,
	type SourceView,
	type StoryElement
} from './elements.ts';
import { loadDataset, loadStory, loadStoryIndex, type LoadResult } from './fetchPublished.ts';
import { findStoryMismatches } from './storyChecks.ts';
import { parseStoryConfig, type CopySource, type StoryConfig } from './storyConfig.ts';

export const ELEMENT_DISCOVERY_STORY = 'element-discovery';
const NAMES_DATASET = 'elements_ko';
const DISCOVERIES_DATASET = 'element_discoveries';

export const ELEMENT_DISCOVERY_CONFIG: StoryConfig = parseStoryConfig(config);

/**
 * 구성 문구를 데이터와 대조해 문구를 숨길 대상(단계 id 또는 퀴즈)을 돌려준다.
 * 사실과 다른 문장을 보여 주지 않도록 운영에서도 숨기고, 콘솔 기록은 개발 모드에서만 남긴다.
 */
export function hiddenCopyTargets(elements: StoryElement[]): Set<string> {
	const mismatches = findStoryMismatches(elements, ELEMENT_DISCOVERY_CONFIG);
	if (import.meta.env.DEV && mismatches.length > 0) {
		console.error('story copy does not match data', mismatches);
	}
	return new Set(mismatches.map((mismatch) => mismatch.target));
}

/** 화면에 보인 단계 문구가 쓴 문구 출처(구성 순서). */
export function shownCopySources(hiddenTargets: Set<string>): CopySource[] {
	const usedIds = new Set(
		ELEMENT_DISCOVERY_CONFIG.steps
			.filter((step) => !hiddenTargets.has(step.id))
			.flatMap((step) => step.sources)
	);
	return ELEMENT_DISCOVERY_CONFIG.copySources.filter((source) => usedIds.has(source.id));
}

export type ElementDiscoveryData = {
	title: string;
	question: string;
	// 목록에서 내려진 스토리면 요약이 없을 수 있다.
	summary: string | null;
	elements: StoryElement[];
	sources: SourceView[];
};

export async function loadElementDiscovery(): Promise<LoadResult<ElementDiscoveryData>> {
	// 요약 문장은 스토리 목록(index.json)에만 있어 함께 읽는다.
	const [story, index] = await Promise.all([loadStory(ELEMENT_DISCOVERY_STORY), loadStoryIndex()]);
	if (story.kind === 'error') return story;
	if (index.kind === 'error') return index;
	const indexEntry = index.data.stories.find((entry) => entry.story === ELEMENT_DISCOVERY_STORY);
	const namesReference = story.data.datasets[NAMES_DATASET];
	const discoveriesReference = story.data.datasets[DISCOVERIES_DATASET];
	if (namesReference === undefined || discoveriesReference === undefined) {
		console.warn('story is missing a dataset reference', ELEMENT_DISCOVERY_STORY);
		return { kind: 'error', reason: 'format' };
	}
	const [names, discoveries] = await Promise.all([
		loadDataset(namesReference.path),
		loadDataset(discoveriesReference.path)
	]);
	if (names.kind === 'error') return names;
	if (discoveries.kind === 'error') return discoveries;

	const elements = buildElements(names.data, discoveries.data);
	if (elements === null) {
		console.warn('story datasets do not match', ELEMENT_DISCOVERY_STORY);
		return { kind: 'error', reason: 'format' };
	}
	return {
		kind: 'ok',
		data: {
			title: story.data.title,
			question: story.data.question,
			summary: indexEntry === undefined ? null : indexEntry.summary,
			elements,
			sources: [...datasetSourceViews(names.data), ...datasetSourceViews(discoveries.data)]
		}
	};
}
