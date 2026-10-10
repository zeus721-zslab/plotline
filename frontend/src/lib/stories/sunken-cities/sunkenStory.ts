// 바다 밑의 도시들 데이터 불러오기: 출처(공개 파일 또는 관리자 미리보기) → 세 데이터셋 → 장소 데이터, 그리고 문구 대조 결과.
import type { LoadResult } from '../../story/fetchPublished.ts';
import type { PublishedDataset } from '../../story/published.ts';
import { datasetSourceViews, type SourceView } from '../../story/sourceViews.ts';
import type { LoadStorySource, NextStory } from '../../story/storySource.ts';
import { parseStoryImages, type StoryImage } from '../../story/storyMedia.ts';
import { CHAPTER_ASIDES } from './asides.ts';
import { CHAPTERS, type ChapterSlots } from './chapters.ts';
import { findSunkenMismatches } from './storyChecks.ts';
// node:test 가 registry.ts 를 거쳐 이 모듈을 읽으므로 JSON 모듈 속성을 밝힌다.
import images from './sunken-cities.images.json' with { type: 'json' };
import { buildSunkenData, type SunkenData } from './sunkenData.ts';

export const SUNKEN_CITIES_STORY = 'sunken-cities';
export const CRITERIA_DATASET = 'atlantis_criteria';
export const PLACES_DATASET = 'sunken_places';
export const MEASURES_DATASET = 'sunken_measures';
/** 이 이야기가 쓰는 데이터 묶음(백엔드 admin_stories/registry.py 와 같은 순서). */
export const SUNKEN_CITIES_DATASETS = [CRITERIA_DATASET, PLACES_DATASET, MEASURES_DATASET] as const;

export const SUNKEN_CITIES_IMAGES: StoryImage[] = parseStoryImages(images);

/** 문구 대조로 숨길 대상. 운영에서도 숨기고, 콘솔 기록은 개발 모드에서만 남긴다. */
export function hiddenSunkenTargets(
	data: SunkenData,
	slots: ChapterSlots,
	storyYear: number
): Set<string> {
	const mismatches = findSunkenMismatches(
		CHAPTERS,
		CHAPTER_ASIDES,
		data,
		slots,
		SUNKEN_CITIES_IMAGES,
		storyYear
	);
	if (import.meta.env.DEV && mismatches.length > 0) {
		console.error('story copy does not match data', mismatches);
	}
	return new Set(mismatches.map((mismatch) => mismatch.target));
}

export type SunkenCitiesData = SunkenData & {
	title: string;
	sources: SourceView[];
	// 목록에서 이 이야기 다음 항목. 없으면 null(다음 이야기 링크를 숨긴다).
	next: NextStory | null;
};

function sourcesOf(datasets: PublishedDataset[]): SourceView[] {
	return datasets.flatMap(datasetSourceViews);
}

export async function loadSunkenCities(
	loadSource: LoadStorySource
): Promise<LoadResult<SunkenCitiesData>> {
	const source = await loadSource();
	if (source.kind === 'error') return source;
	const [criteriaDataset, placesDataset, measuresDataset] = await Promise.all([
		source.data.loadDataset(CRITERIA_DATASET),
		source.data.loadDataset(PLACES_DATASET),
		source.data.loadDataset(MEASURES_DATASET)
	]);
	if (criteriaDataset.kind === 'error') return criteriaDataset;
	if (placesDataset.kind === 'error') return placesDataset;
	if (measuresDataset.kind === 'error') return measuresDataset;

	const data = buildSunkenData(criteriaDataset.data, placesDataset.data, measuresDataset.data);
	if (data === null) {
		console.warn('story dataset values do not match', SUNKEN_CITIES_STORY);
		return { kind: 'error', reason: 'format' };
	}
	return {
		kind: 'ok',
		data: {
			...data,
			title: source.data.title,
			sources: sourcesOf([criteriaDataset.data, placesDataset.data, measuresDataset.data]),
			next: source.data.next
		}
	};
}
