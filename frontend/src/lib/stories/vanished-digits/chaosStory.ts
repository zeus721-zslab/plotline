// 사라진 세 자리 데이터 불러오기: 출처(공개 파일 또는 관리자 미리보기) → 데이터 묶음(공용 storyLoad.ts) → 사건 기록, 그리고 문구 대조 결과.
import type { LoadResult } from '../../story/fetchPublished.ts';
import { usedSourceViews, type SourceView } from '../../story/sourceViews.ts';
import { loadStoryDatasets } from '../../story/storyLoad.ts';
import type { LoadStorySource, NextStory } from '../../story/storySource.ts';
import { buildChaosData, type ChaosData } from './chaosData.ts';
import { storyMismatches } from './storyChecks.ts';

export const CHAOS_STORY = 'vanished-digits';
export const CHAOS_DATASET = 'lorenz_chaos';
/** 이 이야기가 쓰는 데이터 묶음(백엔드 admin_stories/registry.py 와 같은 순서). */
export const CHAOS_DATASETS = [CHAOS_DATASET] as const;

/** 문구 대조로 숨길 대상. 운영에서도 숨기고, 콘솔 기록은 개발 모드에서만 남긴다. */
export function hiddenChaosTargets(data: ChaosData): Set<string> {
	const mismatches = storyMismatches(data);
	if (import.meta.env.DEV && mismatches.length > 0) {
		console.error('story copy does not match data', mismatches);
	}
	return new Set(mismatches.map((mismatch) => mismatch.target));
}

export type ChaosStoryData = ChaosData & {
	title: string;
	sources: SourceView[];
	// 목록에서 이 이야기 다음 항목. 없으면 null(다음 이야기 링크를 숨긴다).
	next: NextStory | null;
};

export async function loadVanishedDigits(
	loadSource: LoadStorySource
): Promise<LoadResult<ChaosStoryData>> {
	const loaded = await loadStoryDatasets(loadSource, CHAOS_DATASETS);
	if (loaded.kind === 'error') return loaded;
	const { source, datasets } = loaded.data;
	const dataset = datasets[CHAOS_DATASET];
	const data = buildChaosData(dataset);
	if (data === null) {
		console.warn('story dataset values do not match', CHAOS_STORY);
		return { kind: 'error', reason: 'format' };
	}
	return {
		kind: 'ok',
		data: { ...data, title: source.title, sources: usedSourceViews(dataset), next: source.next }
	};
}
