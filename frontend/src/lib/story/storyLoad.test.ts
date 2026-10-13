// 이야기 불러오기 뼈대(storyLoad) 테스트(node:test). 가짜 출처로 성공 · 출처 실패 · 묶음 하나 실패를 확인한다.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { LoadFailure, LoadResult } from './fetchPublished.ts';
import type { PublishedDataset } from './published.ts';
import { loadStoryDatasets } from './storyLoad.ts';
import type { LoadStorySource } from './storySource.ts';

function dataset(name: string): PublishedDataset {
	return {
		dataset: name,
		title: name,
		version: 1,
		schema_version: 1,
		created_at: '2026-10-14T00:00:00Z',
		fields: [],
		sources: [],
		rows: []
	};
}

/** 묶음 이름 → 결과. 없는 이름은 format 실패 */
function source(results: Record<string, LoadResult<PublishedDataset>>): LoadStorySource {
	return () =>
		Promise.resolve({
			kind: 'ok',
			data: {
				title: '제목',
				summary: null,
				next: { story: 'next-story', title: '다음' },
				loadDataset: (name) => {
					const result = results[name];
					return Promise.resolve(
						result === undefined ? { kind: 'error', reason: 'format' } : result
					);
				}
			}
		});
}

function failure(reason: LoadFailure): { kind: 'error'; reason: LoadFailure } {
	return { kind: 'error', reason };
}

describe('loadStoryDatasets', () => {
	test('성공: 출처와 이름별 묶음을 돌려준다', async () => {
		const first = dataset('first');
		const second = dataset('second');
		const result = await loadStoryDatasets(
			source({ first: { kind: 'ok', data: first }, second: { kind: 'ok', data: second } }),
			['first', 'second'] as const
		);
		assert.equal(result.kind, 'ok');
		if (result.kind !== 'ok') return;
		assert.equal(result.data.source.title, '제목');
		assert.deepEqual(result.data.source.next, { story: 'next-story', title: '다음' });
		assert.equal(result.data.datasets.first, first);
		assert.equal(result.data.datasets.second, second);
	});

	test('출처 실패는 그대로 돌려준다', async () => {
		const failing: LoadStorySource = () => Promise.resolve(failure('network'));
		assert.deepEqual(await loadStoryDatasets(failing, ['first']), failure('network'));
	});

	test('묶음 하나라도 실패하면 그 실패를 돌려준다', async () => {
		const result = await loadStoryDatasets(
			source({ first: { kind: 'ok', data: dataset('first') }, second: failure('status') }),
			['first', 'second']
		);
		assert.deepEqual(result, failure('status'));
	});
});
