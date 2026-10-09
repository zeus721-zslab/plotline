// 관리자 이야기 발행 화면이 쓰는 이야기 목록과 문구 대조(D-37). 백엔드 admin_stories/registry.py 와 이야기 · 묶음 이름이 같다.
// .svelte · css 를 import 하지 않는다(관리자 작업 페이지 · node:test 에서 읽음). 미리보기 페이지 컴포넌트 매핑은
// 관리자 미리보기 route 에만 둔다.
import { isPublishedDataset, type PublishedDataset } from '../story/published.ts';
import {
	DISCOVERIES_DATASET,
	ELEMENT_DISCOVERY_CONFIG,
	ELEMENT_DISCOVERY_DATASETS,
	ELEMENT_DISCOVERY_IMAGES,
	ELEMENT_DISCOVERY_STORY,
	NAMES_DATASET
} from './element-discovery/elementDiscovery.ts';
import { buildElements } from './element-discovery/elements.ts';
import { findStoryMismatches } from './element-discovery/storyChecks.ts';
import { CHAPTER_ASIDES } from './light-age/asides.ts';
import { CHAPTERS, chapterSlots } from './light-age/chapters.ts';
import {
	LIGHT_AGE_DATASETS,
	LIGHT_AGE_IMAGES,
	LIGHT_AGE_STORY,
	MOMENTS_DATASET,
	OBJECTS_DATASET
} from './light-age/lightAge.ts';
import { storyYear } from './light-age/lightTime.ts';
import { buildEarthMoments, buildSkyObjects } from './light-age/skyData.ts';
import { findLightAgeMismatches } from './light-age/storyChecks.ts';

/** 묶음 내용이 공개 형식이 아니거나 이야기 데이터로 만들 수 없어 대조하지 못함. */
export class StoryCheckError extends Error {}

export type StoryEntry = {
	story: string;
	datasetNames: readonly string[];
	/** 숨겨질 문구의 고유 target 집합(페이지가 Set 으로 숨기는 단위). 대조하지 못하면 StoryCheckError. */
	checkHidden: (datasets: Record<string, unknown>, now: Date) => Set<string>;
};

function requireDataset(datasets: Record<string, unknown>, name: string): PublishedDataset {
	const dataset = datasets[name];
	if (!isPublishedDataset(dataset))
		throw new StoryCheckError(`dataset ${name} is not published data`);
	return dataset;
}

function targetsOf(mismatches: { target: string }[]): Set<string> {
	return new Set(mismatches.map((mismatch) => mismatch.target));
}

function elementDiscoveryHidden(datasets: Record<string, unknown>): Set<string> {
	const elements = buildElements(
		requireDataset(datasets, NAMES_DATASET),
		requireDataset(datasets, DISCOVERIES_DATASET)
	);
	if (elements === null) throw new StoryCheckError('element datasets do not match');
	return targetsOf(
		findStoryMismatches(elements, ELEMENT_DISCOVERY_CONFIG, ELEMENT_DISCOVERY_IMAGES)
	);
}

function lightAgeHidden(datasets: Record<string, unknown>, now: Date): Set<string> {
	const objects = buildSkyObjects(requireDataset(datasets, OBJECTS_DATASET));
	const moments = buildEarthMoments(requireDataset(datasets, MOMENTS_DATASET));
	if (objects === null || moments === null) throw new StoryCheckError('sky datasets do not match');
	return targetsOf(
		findLightAgeMismatches(
			CHAPTERS,
			CHAPTER_ASIDES,
			objects,
			moments,
			chapterSlots(objects, now),
			LIGHT_AGE_IMAGES,
			storyYear(now)
		)
	);
}

export const STORY_ENTRIES = [
	{
		story: ELEMENT_DISCOVERY_STORY,
		datasetNames: ELEMENT_DISCOVERY_DATASETS,
		checkHidden: elementDiscoveryHidden
	},
	{ story: LIGHT_AGE_STORY, datasetNames: LIGHT_AGE_DATASETS, checkHidden: lightAgeHidden }
] as const satisfies readonly StoryEntry[];

export type RegisteredStory = (typeof STORY_ENTRIES)[number]['story'];

export function findStoryEntry(story: string): StoryEntry | null {
	const entry = STORY_ENTRIES.find((candidate) => candidate.story === story);
	return entry === undefined ? null : entry;
}
