// 빛의 나이 스토리 데이터 불러오기: 출처(공개 파일 또는 관리자 미리보기) → 두 데이터셋 → 천체 · 사건 목록, 그리고 문구 대조 결과.
import type { LoadResult } from '../../story/fetchPublished.ts';
import { datasetSourceViews, type SourceView } from '../../story/sourceViews.ts';
import type { LoadStorySource, NextStory } from '../../story/storySource.ts';
import { parseStoryImages, type StoryImage } from '../../story/storyMedia.ts';
import { CHAPTER_ASIDES } from './asides.ts';
import { CHAPTERS } from './chapters.ts';
// node:test 가 registry.ts 를 거쳐 이 모듈을 읽으므로 JSON 모듈 속성을 밝힌다.
import images from './light-age.images.json' with { type: 'json' };
import { buildEarthMoments, buildSkyObjects, type EarthMoment, type SkyObject } from './skyData.ts';
import { findLightAgeMismatches } from './storyChecks.ts';

export const LIGHT_AGE_STORY = 'light-age';
export const OBJECTS_DATASET = 'sky_objects';
export const MOMENTS_DATASET = 'earth_moments';
/** 이 이야기가 쓰는 데이터 묶음(백엔드 admin_stories/registry.py 와 같은 순서). */
export const LIGHT_AGE_DATASETS = [OBJECTS_DATASET, MOMENTS_DATASET] as const;

export const LIGHT_AGE_IMAGES: StoryImage[] = parseStoryImages(images);

/**
 * 장 문구 · 사건 줄 · 곁들임 카드를 데이터와 대조해 숨길 대상을 돌려준다.
 * 사실과 다른 문장을 보여 주지 않도록 운영에서도 숨기고, 콘솔 기록은 개발 모드에서만 남긴다.
 */
export function hiddenLightAgeTargets(
	objects: Map<string, SkyObject>,
	moments: Map<string, EarthMoment>,
	slots: Record<string, string>,
	currentYear: number
): Set<string> {
	const mismatches = findLightAgeMismatches(
		CHAPTERS,
		CHAPTER_ASIDES,
		objects,
		moments,
		slots,
		LIGHT_AGE_IMAGES,
		currentYear
	);
	if (import.meta.env.DEV && mismatches.length > 0) {
		console.error('story copy does not match data', mismatches);
	}
	return new Set(mismatches.map((mismatch) => mismatch.target));
}

export type LightAgeData = {
	title: string;
	objects: Map<string, SkyObject>;
	moments: Map<string, EarthMoment>;
	sources: SourceView[];
	// 목록에서 이 스토리 다음 항목. 없으면 null(다음 이야기 링크를 숨긴다).
	next: NextStory | null;
};

export async function loadLightAge(loadSource: LoadStorySource): Promise<LoadResult<LightAgeData>> {
	const source = await loadSource();
	if (source.kind === 'error') return source;
	const [objectsDataset, momentsDataset] = await Promise.all([
		source.data.loadDataset(OBJECTS_DATASET),
		source.data.loadDataset(MOMENTS_DATASET)
	]);
	if (objectsDataset.kind === 'error') return objectsDataset;
	if (momentsDataset.kind === 'error') return momentsDataset;

	const objects = buildSkyObjects(objectsDataset.data);
	const moments = buildEarthMoments(momentsDataset.data);
	if (objects === null || moments === null) {
		console.warn('story dataset values do not match', LIGHT_AGE_STORY);
		return { kind: 'error', reason: 'format' };
	}
	return {
		kind: 'ok',
		data: {
			title: source.data.title,
			objects,
			moments,
			sources: [
				...datasetSourceViews(objectsDataset.data),
				...datasetSourceViews(momentsDataset.data)
			],
			next: source.data.next
		}
	};
}
