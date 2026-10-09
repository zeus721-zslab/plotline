// 빛의 나이 스토리 데이터 불러오기: 스토리 파일 → 두 데이터셋 → 천체 · 사건 목록, 그리고 문구 대조 결과.
import {
	loadDataset,
	loadStory,
	loadStoryIndex,
	type LoadResult
} from '../../story/fetchPublished.ts';
import { datasetSourceViews, type SourceView } from '../../story/sourceViews.ts';
import { parseStoryImages, type StoryImage } from '../../story/storyMedia.ts';
import { CHAPTER_ASIDES } from './asides.ts';
import { CHAPTERS } from './chapters.ts';
import images from './light-age.images.json';
import { buildEarthMoments, buildSkyObjects, type EarthMoment, type SkyObject } from './skyData.ts';
import { findLightAgeMismatches } from './storyChecks.ts';

export const LIGHT_AGE_STORY = 'light-age';
const OBJECTS_DATASET = 'sky_objects';
const MOMENTS_DATASET = 'earth_moments';

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

export type NextStory = { story: string; title: string };

export type LightAgeData = {
	title: string;
	objects: Map<string, SkyObject>;
	moments: Map<string, EarthMoment>;
	sources: SourceView[];
	// 목록에서 이 스토리 다음 항목. 없으면 null(다음 이야기 링크를 숨긴다).
	next: NextStory | null;
};

export async function loadLightAge(): Promise<LoadResult<LightAgeData>> {
	// 다음 이야기 링크는 스토리 목록(index.json)에서 찾는다.
	const [story, index] = await Promise.all([loadStory(LIGHT_AGE_STORY), loadStoryIndex()]);
	if (story.kind === 'error') return story;
	if (index.kind === 'error') return index;
	const objectsReference = story.data.datasets[OBJECTS_DATASET];
	const momentsReference = story.data.datasets[MOMENTS_DATASET];
	if (objectsReference === undefined || momentsReference === undefined) {
		console.warn('story is missing a dataset reference', LIGHT_AGE_STORY);
		return { kind: 'error', reason: 'format' };
	}
	const [objectsDataset, momentsDataset] = await Promise.all([
		loadDataset(objectsReference.path),
		loadDataset(momentsReference.path)
	]);
	if (objectsDataset.kind === 'error') return objectsDataset;
	if (momentsDataset.kind === 'error') return momentsDataset;

	const objects = buildSkyObjects(objectsDataset.data);
	const moments = buildEarthMoments(momentsDataset.data);
	if (objects === null || moments === null) {
		console.warn('story dataset values do not match', LIGHT_AGE_STORY);
		return { kind: 'error', reason: 'format' };
	}
	const stories = index.data.stories;
	const position = stories.findIndex((entry) => entry.story === LIGHT_AGE_STORY);
	const nextEntry = position === -1 ? undefined : stories[position + 1];
	return {
		kind: 'ok',
		data: {
			title: story.data.title,
			objects,
			moments,
			sources: [
				...datasetSourceViews(objectsDataset.data),
				...datasetSourceViews(momentsDataset.data)
			],
			next: nextEntry === undefined ? null : { story: nextEntry.story, title: nextEntry.title }
		}
	};
}
