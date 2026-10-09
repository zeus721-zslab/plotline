// 사건의 지평선 너머 데이터 불러오기: 출처(공개 파일 또는 관리자 미리보기) → 두 데이터셋 → 블랙홀 · 경계 목록, 그리고 문구 대조 결과.
import type { LoadResult } from '../../story/fetchPublished.ts';
import type { PublishedDataset } from '../../story/published.ts';
import { datasetSourceViews, type SourceView } from '../../story/sourceViews.ts';
import type { LoadStorySource } from '../../story/storySource.ts';
import { parseStoryImages, type StoryImage } from '../../story/storyMedia.ts';
import { CHAPTER_ASIDES } from './asides.ts';
import images from './black-hole.images.json' with { type: 'json' };
import { BRANCH_CHAPTER, CHAPTERS } from './chapters.ts';
import { buildBlackHoles, buildBoundaries } from './holeData.ts';
import { findBlackHoleMismatches, type FallData } from './storyChecks.ts';

export const BLACK_HOLE_STORY = 'black-hole';
export const HOLES_DATASET = 'black_holes';
export const BOUNDARIES_DATASET = 'bh_boundaries';
/** 이 이야기가 쓰는 데이터 묶음(백엔드 admin_stories/registry.py 와 같은 순서). */
export const BLACK_HOLE_DATASETS = [HOLES_DATASET, BOUNDARIES_DATASET] as const;

export const BLACK_HOLE_IMAGES: StoryImage[] = parseStoryImages(images);

/** 묶음 두 개를 화면 데이터로. 값 형식이 다르면 null. */
export function buildFallData(
	holesDataset: PublishedDataset,
	boundariesDataset: PublishedDataset
): FallData | null {
	const holes = buildBlackHoles(holesDataset);
	const boundaries = buildBoundaries(boundariesDataset);
	return holes === null || boundaries === null ? null : { holes, boundaries };
}

/** 문구 대조로 숨길 대상. 운영에서도 숨기고, 콘솔 기록은 개발 모드에서만 남긴다. */
export function hiddenBlackHoleTargets(data: FallData, slots: Record<string, string>): Set<string> {
	const mismatches = findBlackHoleMismatches(
		CHAPTERS,
		CHAPTER_ASIDES,
		data,
		slots,
		BLACK_HOLE_IMAGES,
		BRANCH_CHAPTER
	);
	if (import.meta.env.DEV && mismatches.length > 0) {
		console.error('story copy does not match data', mismatches);
	}
	return new Set(mismatches.map((mismatch) => mismatch.target));
}

// 다음 이야기(source.next)는 싣지 않는다: 3편 끝에는 다음 이야기 링크를 두지 않는다(D-39).
export type BlackHoleData = FallData & {
	title: string;
	sources: SourceView[];
};

export async function loadBlackHole(
	loadSource: LoadStorySource
): Promise<LoadResult<BlackHoleData>> {
	const source = await loadSource();
	if (source.kind === 'error') return source;
	const [holesDataset, boundariesDataset] = await Promise.all([
		source.data.loadDataset(HOLES_DATASET),
		source.data.loadDataset(BOUNDARIES_DATASET)
	]);
	if (holesDataset.kind === 'error') return holesDataset;
	if (boundariesDataset.kind === 'error') return boundariesDataset;

	const fall = buildFallData(holesDataset.data, boundariesDataset.data);
	if (fall === null) {
		console.warn('story dataset values do not match', BLACK_HOLE_STORY);
		return { kind: 'error', reason: 'format' };
	}
	return {
		kind: 'ok',
		data: {
			...fall,
			title: source.data.title,
			sources: [
				...datasetSourceViews(holesDataset.data),
				...datasetSourceViews(boundariesDataset.data)
			]
		}
	};
}
