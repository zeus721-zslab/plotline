// 원소 발견사 스토리 데이터 불러오기: 출처(공개 파일 또는 관리자 미리보기) → 두 데이터셋 → 원소 목록.
import type { LoadResult } from '../../story/fetchPublished.ts';
import { datasetSourceViews, type SourceView } from '../../story/sourceViews.ts';
import type { CopySource } from '../../story/storyConfig.ts';
import type { LoadStorySource } from '../../story/storySource.ts';
import { parseStoryImages, type StoryImage } from '../../story/storyMedia.ts';
import { parseStoryConfig, type StoryConfig } from './config.ts';
// node:test 가 registry.ts 를 거쳐 이 모듈을 읽으므로 JSON 모듈 속성을 밝힌다.
import config from './element-discovery.config.json' with { type: 'json' };
import images from './element-discovery.images.json' with { type: 'json' };
import { buildElements, type StoryElement } from './elements.ts';
import { findStoryMismatches } from './storyChecks.ts';

export const ELEMENT_DISCOVERY_STORY = 'element-discovery';
export const NAMES_DATASET = 'elements_ko';
export const DISCOVERIES_DATASET = 'element_discoveries';
/** 이 이야기가 쓰는 데이터 묶음(백엔드 admin_stories/registry.py 와 같은 순서). */
export const ELEMENT_DISCOVERY_DATASETS = [NAMES_DATASET, DISCOVERIES_DATASET] as const;

export const ELEMENT_DISCOVERY_CONFIG: StoryConfig = parseStoryConfig(config);

export const ELEMENT_DISCOVERY_IMAGES: StoryImage[] = parseStoryImages(images);

/**
 * 구성 문구를 데이터와 대조해 문구를 숨길 대상(단계 id 또는 퀴즈)을 돌려준다.
 * 사실과 다른 문장을 보여 주지 않도록 운영에서도 숨기고, 콘솔 기록은 개발 모드에서만 남긴다.
 */
export function hiddenCopyTargets(elements: StoryElement[]): Set<string> {
	const mismatches = findStoryMismatches(
		elements,
		ELEMENT_DISCOVERY_CONFIG,
		ELEMENT_DISCOVERY_IMAGES
	);
	if (import.meta.env.DEV && mismatches.length > 0) {
		console.error('story copy does not match data', mismatches);
	}
	return new Set(mismatches.map((mismatch) => mismatch.target));
}

/** 화면에 보인 단계 문구와 곁들임 카드가 쓴 문구 출처(구성 순서). */
export function shownCopySources(hiddenTargets: Set<string>): CopySource[] {
	const usedIds = new Set(
		ELEMENT_DISCOVERY_CONFIG.steps
			.filter((step) => !hiddenTargets.has(step.id))
			.flatMap((step) => [...step.sources, ...(step.aside === null ? [] : step.aside.sources)])
	);
	return ELEMENT_DISCOVERY_CONFIG.copySources.filter((source) => usedIds.has(source.id));
}

export type ElementDiscoveryData = {
	title: string;
	// 목록에서 내려진 스토리면 요약이 없을 수 있다.
	summary: string | null;
	elements: StoryElement[];
	sources: SourceView[];
};

export async function loadElementDiscovery(
	loadSource: LoadStorySource
): Promise<LoadResult<ElementDiscoveryData>> {
	const source = await loadSource();
	if (source.kind === 'error') return source;
	const [names, discoveries] = await Promise.all([
		source.data.loadDataset(NAMES_DATASET),
		source.data.loadDataset(DISCOVERIES_DATASET)
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
			title: source.data.title,
			summary: source.data.summary,
			elements,
			sources: [...datasetSourceViews(names.data), ...datasetSourceViews(discoveries.data)]
		}
	};
}
