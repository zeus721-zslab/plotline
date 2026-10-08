// 공개 데이터(/data/) 요청. 화면 컴포넌트는 fetch 를 직접 부르지 않고 이 모듈을 거친다.
import {
	isPublishedDataset,
	isPublishedStory,
	isStoryIndex,
	type PublishedDataset,
	type PublishedStory,
	type StoryIndex
} from './published.ts';

export type LoadFailure = 'network' | 'status' | 'format';
export type LoadResult<T> = { kind: 'ok'; data: T } | { kind: 'error'; reason: LoadFailure };

const STORY_INDEX_PATH = '/data/stories/index.json';

function storyPath(story: string): string {
	return `/data/stories/${story}.json`;
}

async function fetchJson<T>(
	path: string,
	guard: (value: unknown) => value is T
): Promise<LoadResult<T>> {
	let response: Response;
	try {
		response = await fetch(path);
	} catch (error) {
		// fetch 는 서버 응답이 없을 때(연결 실패·오프라인)만 TypeError 로 reject 한다.
		if (error instanceof TypeError) {
			console.warn('published data network error', path, error);
			return { kind: 'error', reason: 'network' };
		}
		throw error;
	}
	if (!response.ok) {
		console.warn('published data unexpected status', path, response.status);
		return { kind: 'error', reason: 'status' };
	}
	let body: unknown;
	try {
		body = await response.json();
	} catch (error) {
		if (error instanceof SyntaxError) {
			console.warn('published data invalid json', path, error);
			return { kind: 'error', reason: 'format' };
		}
		throw error;
	}
	if (!guard(body)) {
		console.warn('published data shape mismatch', path);
		return { kind: 'error', reason: 'format' };
	}
	return { kind: 'ok', data: body };
}

export function loadStoryIndex(): Promise<LoadResult<StoryIndex>> {
	return fetchJson(STORY_INDEX_PATH, isStoryIndex);
}

export function loadStory(story: string): Promise<LoadResult<PublishedStory>> {
	return fetchJson(storyPath(story), isPublishedStory);
}

export function loadDataset(path: string): Promise<LoadResult<PublishedDataset>> {
	return fetchJson(path, isPublishedDataset);
}
