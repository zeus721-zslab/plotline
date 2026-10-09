// 이야기 페이지 컴포넌트가 데이터를 받는 출처(D-37). 공개 화면은 발행 파일(/data/), 관리자 미리보기는 관리자 판 내용 API 를 쓴다.
// 페이지는 출처를 "불러오기 함수"로 받아, 다시 시도할 때마다 이야기 정보부터 다시 읽는다.
import {
	loadDataset,
	loadStory,
	loadStoryIndex,
	type LoadFailure,
	type LoadResult
} from './fetchPublished.ts';
import type { PublishedDataset } from './published.ts';

export type NextStory = { story: string; title: string };

export type StorySource = {
	title: string;
	// 목록에서 내려진 이야기면 요약이 없을 수 있다.
	summary: string | null;
	// 목록에서 이 이야기 다음 항목. 없으면 null(다음 이야기 링크를 숨긴다).
	next: NextStory | null;
	loadDataset: (name: string) => Promise<LoadResult<PublishedDataset>>;
};

export type LoadStorySource = () => Promise<LoadResult<StorySource>>;

const FORMAT_FAILURE: { kind: 'error'; reason: LoadFailure } = { kind: 'error', reason: 'format' };

/** 공개 출처: 이야기 파일 · 목록을 함께 읽고, 묶음은 이야기 파일의 datasets[name].path 를 따라 읽는다. */
export async function loadPublishedSource(
	story: string,
	datasetNames: readonly string[]
): Promise<LoadResult<StorySource>> {
	// 요약 · 다음 이야기는 목록(index.json)에만 있어 함께 읽는다.
	const [published, index] = await Promise.all([loadStory(story), loadStoryIndex()]);
	if (published.kind === 'error') return published;
	if (index.kind === 'error') return index;
	const references = published.data.datasets;
	if (datasetNames.some((name) => references[name] === undefined)) {
		console.warn('story is missing a dataset reference', story);
		return FORMAT_FAILURE;
	}
	const stories = index.data.stories;
	const position = stories.findIndex((entry) => entry.story === story);
	const entry = position === -1 ? undefined : stories[position];
	const nextEntry = position === -1 ? undefined : stories[position + 1];
	return {
		kind: 'ok',
		data: {
			title: published.data.title,
			summary: entry === undefined ? null : entry.summary,
			next: nextEntry === undefined ? null : { story: nextEntry.story, title: nextEntry.title },
			loadDataset: (name) => {
				const reference = references[name];
				return reference === undefined
					? Promise.resolve(FORMAT_FAILURE)
					: loadDataset(reference.path);
			}
		}
	};
}
