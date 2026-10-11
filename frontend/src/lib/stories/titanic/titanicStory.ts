// 마지막 2시간 40분 데이터 불러오기: 출처(공개 파일 또는 관리자 미리보기) → 데이터 묶음 → 사건 기록, 그리고 문구 대조 결과.
import type { LoadResult } from '../../story/fetchPublished.ts';
import { datasetSourceViews, type SourceView } from '../../story/sourceViews.ts';
import type { LoadStorySource, NextStory } from '../../story/storySource.ts';
import { storyYear } from '../light-age/lightTime.ts';
import { CHAPTERS } from './chapters.ts';
import { findTitanicMismatches } from './storyChecks.ts';
import { buildTitanicData, type TitanicData } from './titanicData.ts';

export const TITANIC_STORY = 'titanic';
export const EVENTS_DATASET = 'titanic_last_night';
/** 이 이야기가 쓰는 데이터 묶음(백엔드 admin_stories/registry.py 와 같은 순서). */
export const TITANIC_DATASETS = [EVENTS_DATASET] as const;

/** 문구 대조로 숨길 대상. 운영에서도 숨기고, 콘솔 기록은 개발 모드에서만 남긴다. */
export function hiddenTitanicTargets(data: TitanicData, now: Date): Set<string> {
	const mismatches = findTitanicMismatches(CHAPTERS, data, storyYear(now));
	if (import.meta.env.DEV && mismatches.length > 0) {
		console.error('story copy does not match data', mismatches);
	}
	return new Set(mismatches.map((mismatch) => mismatch.target));
}

export type TitanicStoryData = TitanicData & {
	title: string;
	sources: SourceView[];
	// 목록에서 이 이야기 다음 항목. 없으면 null(다음 이야기 링크를 숨긴다).
	next: NextStory | null;
};

export async function loadTitanic(
	loadSource: LoadStorySource
): Promise<LoadResult<TitanicStoryData>> {
	const source = await loadSource();
	if (source.kind === 'error') return source;
	const dataset = await source.data.loadDataset(EVENTS_DATASET);
	if (dataset.kind === 'error') return dataset;
	const data = buildTitanicData(dataset.data);
	if (data === null) {
		console.warn('story dataset values do not match', TITANIC_STORY);
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
