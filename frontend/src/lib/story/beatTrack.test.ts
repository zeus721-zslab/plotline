// 비트 트랙 스크롤(beatTrack) 테스트(node:test).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { layoutTrack, resolveIndex, scrollForIndex } from './beatTrack.ts';

// 휴대폰 높이 844px 에서 vh 가 정수 px 로 떨어지지 않는 길이를 섞는다(반올림하지 않음을 확인)
const VIEWPORT = 844;
const ENTRIES = [{ vh: 260 }, { vh: 90 }, { vh: 1018.7 }, { vh: 150 }];

describe('layoutTrack', () => {
	test('구간 높이 = vh × 화면 높이 / 100, 윗변은 앞 구간 높이의 누적(반올림 없음)', () => {
		const layout = layoutTrack(ENTRIES, VIEWPORT);
		assert.deepEqual(layout.heights, [2194.4, 759.6, (1018.7 * VIEWPORT) / 100, 1266]);
		assert.equal(layout.tops[0], 0);
		assert.equal(layout.tops[1], 2194.4);
		assert.equal(layout.tops[3], layout.tops[2] + layout.heights[2]);
		assert.equal(layout.total, layout.tops[3] + 1266);
	});

	test('빈 목록이면 길이 0', () => {
		assert.deepEqual(layoutTrack([], VIEWPORT), { tops: [], heights: [], total: 0 });
	});
});

describe('resolveIndex', () => {
	const layout = layoutTrack(ENTRIES, VIEWPORT);

	test('트랙 앞(음수)은 첫 구간 p 0', () => {
		assert.deepEqual(resolveIndex(-100, layout), { index: 0, p: 0 });
	});

	test('구간 경계는 다음 구간의 p 0', () => {
		assert.deepEqual(resolveIndex(layout.tops[1], layout), { index: 1, p: 0 });
		assert.deepEqual(resolveIndex(layout.tops[2], layout), { index: 2, p: 0 });
	});

	test('구간 가운데는 p 0.5', () => {
		const middle = layout.tops[2] + layout.heights[2] / 2;
		const position = resolveIndex(middle, layout);
		assert.equal(position.index, 2);
		assert.ok(Math.abs(position.p - 0.5) < 1e-12);
	});

	test('트랙 뒤는 마지막 구간 p 1', () => {
		assert.deepEqual(resolveIndex(layout.total + 500, layout), { index: 3, p: 1 });
	});
});

describe('scrollForIndex', () => {
	test('resolveIndex 와 왕복하면 같은 구간 · 진행값', () => {
		const layout = layoutTrack(ENTRIES, VIEWPORT);
		for (const [index, p] of [
			[0, 0.3],
			[1, 0.75],
			[2, 0.123],
			[3, 0.9]
		] as const) {
			const position = resolveIndex(scrollForIndex(index, p, layout), layout);
			assert.equal(position.index, index);
			assert.ok(Math.abs(position.p - p) < 1e-9, `${index} ${p} → ${position.p}`);
		}
	});

	test('화면 높이가 바뀌어도 같은 구간 · 진행값 자리로 옮겨진다', () => {
		const before = layoutTrack(ENTRIES, VIEWPORT);
		const after = layoutTrack(ENTRIES, 900);
		const position = resolveIndex(before.tops[2] + 1234, before);
		const moved = resolveIndex(scrollForIndex(position.index, position.p, after), after);
		assert.equal(moved.index, position.index);
		assert.ok(Math.abs(moved.p - position.p) < 1e-9);
	});
});
