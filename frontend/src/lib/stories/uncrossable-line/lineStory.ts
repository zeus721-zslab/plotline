// 넘을 수 없는 선 데이터 불러오기: 출처(공개 파일 또는 관리자 미리보기) → 데이터 묶음 → 사건 기록, 그리고 문구 대조 결과.
import type { LoadResult } from '../../story/fetchPublished.ts';
import { usedSourceViews, type SourceView } from '../../story/sourceViews.ts';
import type { LoadStorySource, NextStory } from '../../story/storySource.ts';
import { buildLineData, type LineData } from './lineData.ts';
import { storyMismatches } from './storyChecks.ts';

export const LINE_STORY = 'uncrossable-line';
export const LINE_DATASET = 'bell_line';
/** 이 이야기가 쓰는 데이터 묶음(백엔드 admin_stories/registry.py 와 같은 순서). */
export const LINE_DATASETS = [LINE_DATASET] as const;

/** 문구 대조로 숨길 대상. 운영에서도 숨기고, 콘솔 기록은 개발 모드에서만 남긴다. */
export function hiddenLineTargets(data: LineData): Set<string> {
	const mismatches = storyMismatches(data);
	if (import.meta.env.DEV && mismatches.length > 0) {
		console.error('story copy does not match data', mismatches);
	}
	return new Set(mismatches.map((mismatch) => mismatch.target));
}

export type LineStoryData = LineData & {
	title: string;
	sources: SourceView[];
	// 목록에서 이 이야기 다음 항목. 없으면 null(다음 이야기 링크를 숨긴다).
	next: NextStory | null;
};

export async function loadUncrossableLine(
	loadSource: LoadStorySource
): Promise<LoadResult<LineStoryData>> {
	const source = await loadSource();
	if (source.kind === 'error') return source;
	const dataset = await source.data.loadDataset(LINE_DATASET);
	if (dataset.kind === 'error') return dataset;
	const data = buildLineData(dataset.data);
	if (data === null) {
		console.warn('story dataset values do not match', LINE_STORY);
		return { kind: 'error', reason: 'format' };
	}
	return {
		kind: 'ok',
		data: {
			...data,
			title: source.data.title,
			sources: usedSourceViews(dataset.data),
			next: source.data.next
		}
	};
}
