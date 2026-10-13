// 이야기 불러오기 뼈대(D-47 D1): 출처(공개 파일 또는 관리자 미리보기)를 읽고, 이야기가 쓰는 데이터 묶음을 모두 받는다.
// 묶음 해석(build)과 화면 데이터 조립은 편이 한다. 하나라도 실패하면 그 실패를 그대로 돌려준다(화면은 불러오기 실패).
import type { LoadResult } from './fetchPublished.ts';
import type { PublishedDataset } from './published.ts';
import type { LoadStorySource, StorySource } from './storySource.ts';

export type StoryDatasets<Name extends string> = {
	source: StorySource;
	datasets: Record<Name, PublishedDataset>;
};

export async function loadStoryDatasets<Name extends string>(
	loadSource: LoadStorySource,
	names: readonly Name[]
): Promise<LoadResult<StoryDatasets<Name>>> {
	const source = await loadSource();
	if (source.kind === 'error') return source;
	const results = await Promise.all(names.map((name) => source.data.loadDataset(name)));
	const datasets: Partial<Record<Name, PublishedDataset>> = {};
	for (const [position, result] of results.entries()) {
		if (result.kind === 'error') return result;
		datasets[names[position]] = result.data;
	}
	// 위 반복이 names 를 모두 채웠으므로(실패면 이미 반환) 빠진 이름이 없다
	return {
		kind: 'ok',
		data: { source: source.data, datasets: datasets as Record<Name, PublishedDataset> }
	};
}
