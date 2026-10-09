// 이야기 미리보기 쿼리(storyPreview) 테스트(node:test, D-37).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePreviewQuery, previewSearch } from './storyPreview.ts';

test('묶음 이름이 title 이어도 제목 · 판 번호가 서로 덮이지 않는다', () => {
	const query = { title: '제목', summary: '요약', datasets: { title: 3, summary: 5 } };

	const search = previewSearch(query);

	assert.deepEqual(parsePreviewQuery(new URLSearchParams(search), ['title', 'summary']), query);
});
