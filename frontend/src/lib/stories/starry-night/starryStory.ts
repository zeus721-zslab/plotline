// 그가 실패작이라 부른 밤 데이터 불러오기: 출처(공개 파일 또는 관리자 미리보기) → 데이터 묶음 → 사건 날짜, 그리고 문구 대조 결과.
import type { LoadResult } from '../../story/fetchPublished.ts';
import { datasetSourceViews, type SourceView } from '../../story/sourceViews.ts';
import type { LoadStorySource, NextStory } from '../../story/storySource.ts';
import { parseStoryImages, type StoryImage } from '../../story/storyMedia.ts';
import { ARTWORK_LABEL, CHAPTERS } from './chapters.ts';
// node:test 가 registry.ts 를 거쳐 이 모듈을 읽으므로 JSON 모듈 속성을 밝힌다.
import images from './starry-night.images.json' with { type: 'json' };
import { buildStarryData, type StarryData } from './starryData.ts';
import { findLabelMismatches, findStarryMismatches } from './storyChecks.ts';

export const STARRY_NIGHT_STORY = 'starry-night';
export const EVENTS_DATASET = 'vangogh_starry_night';
/** 이 이야기가 쓰는 데이터 묶음(백엔드 admin_stories/registry.py 와 같은 순서). */
export const STARRY_NIGHT_DATASETS = [EVENTS_DATASET] as const;

export const STARRY_NIGHT_IMAGES: StoryImage[] = parseStoryImages(images);

/** 문구 대조로 숨길 대상. 운영에서도 숨기고, 콘솔 기록은 개발 모드에서만 남긴다. */
export function hiddenStarryTargets(data: StarryData): Set<string> {
	const mismatches = [
		...findStarryMismatches(CHAPTERS, data),
		...findLabelMismatches(ARTWORK_LABEL.detailsClaims, data)
	];
	if (import.meta.env.DEV && mismatches.length > 0) {
		console.error('story copy does not match data', mismatches);
	}
	return new Set(mismatches.map((mismatch) => mismatch.target));
}

export type StarryNightData = StarryData & {
	title: string;
	sources: SourceView[];
	// 목록에서 이 이야기 다음 항목. 없으면 null(다음 이야기 링크를 숨긴다).
	next: NextStory | null;
};

export async function loadStarryNight(
	loadSource: LoadStorySource
): Promise<LoadResult<StarryNightData>> {
	const source = await loadSource();
	if (source.kind === 'error') return source;
	const dataset = await source.data.loadDataset(EVENTS_DATASET);
	if (dataset.kind === 'error') return dataset;
	const data = buildStarryData(dataset.data);
	if (data === null) {
		console.warn('story dataset values do not match', STARRY_NIGHT_STORY);
		return { kind: 'error', reason: 'format' };
	}
	return {
		kind: 'ok',
		data: {
			...data,
			title: source.data.title,
			sources: datasetSourceViews(dataset.data),
			next: source.data.next
		}
	};
}
