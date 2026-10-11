// 마지막 2시간 40분 장 → 장면 · 시계(titanicScene) · 하늘 자료(skyData) 테스트(node:test, 의존성 없음).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { CHAPTERS } from './chapters.ts';
import { bodyAt, minutesFromAts, parseSkyData, SKY_FILES, type SkyData } from './skyData.ts';
import {
	auroraAlpha,
	clockFor,
	COVER_FRAME,
	dawnMinute,
	DAWN_END,
	FLICKER_END,
	FLICKER_PATTERN,
	FLICKER_START,
	frameAt,
	stillFrameAt,
	type SceneFrame,
	type SinkingFrame
} from './titanicScene.ts';

function indexOf(id: string): number {
	const index = CHAPTERS.findIndex((chapter) => chapter.id === id);
	assert.ok(index >= 0, id);
	return index;
}

function sinking(frame: SceneFrame): SinkingFrame {
	if (frame.kind !== 'sinking') throw new Error(`expected sinking frame, got ${frame.kind}`);
	return frame;
}

function clockAt(id: string, progress: number): string | null {
	const index = indexOf(id);
	return clockFor(index, frameAt(index, progress));
}

function readStatic(path: string): unknown {
	return JSON.parse(readFileSync(new URL(`../../../../static${path}`, import.meta.url), 'utf8'));
}

describe('장 → 장면 · 시계', () => {
	test('시계: 표지 · 1장 · 에필로그는 숨김, 2장 21:00 → 23:39, 3장 23:40', () => {
		assert.equal(clockFor(-1, COVER_FRAME), null);
		assert.equal(clockAt('now', 0.5), null);
		assert.equal(clockAt('epilogue', 1), null);
		assert.equal(clockAt('stars', 0), '21:00');
		assert.equal(clockAt('stars', 1), '23:39');
		assert.equal(clockAt('collision', 0.5), '23:40');
	});

	test('4장: 00:15 → 01:45 · 기울기 4°→6° · sink 3→4 · 불빛 거의 다 켜짐', () => {
		const index = indexOf('signals');
		const start = sinking(frameAt(index, 0));
		const end = sinking(frameAt(index, 1));
		assert.equal(clockAt('signals', 0), '00:15');
		assert.equal(clockAt('signals', 1), '01:45');
		assert.deepEqual([start.tilt, end.tilt, start.sink, end.sink], [4, 6, 3, 4]);
		assert.ok(end.lightsOn && end.cut <= 0.05 && end.red === 0);
	});

	test('5장: 02:00 → 02:20 · 기울기 6°→13° · sink 4→9 · 깜빡임 6칸 동안 시계 02:17', () => {
		const index = indexOf('last-signal');
		assert.equal(clockAt('last-signal', 0), '02:00');
		assert.equal(clockAt('last-signal', 1), '02:20');
		assert.deepEqual([sinking(frameAt(index, 0)).tilt, sinking(frameAt(index, 1)).tilt], [6, 13]);
		assert.deepEqual([sinking(frameAt(index, 0)).sink, sinking(frameAt(index, 1)).sink], [4, 9]);
		const cellShare = (FLICKER_END - FLICKER_START) / FLICKER_PATTERN.length;
		const cells = FLICKER_PATTERN.map((_, cell) => {
			const progress = FLICKER_START + cellShare * (cell + 0.5);
			assert.equal(clockAt('last-signal', progress), '02:17');
			const frame = sinking(frameAt(index, progress));
			assert.equal(frame.flickerCell, cell);
			return frame.lightsOn ? 1 : 0;
		});
		assert.deepEqual(cells, [...FLICKER_PATTERN]);
		assert.equal(sinking(frameAt(index, 0.95)).lightsOn, false);
	});

	test('6장: 03:00 → 05:43 · 오로라는 04:00 까지 사라짐', () => {
		const index = indexOf('dawn');
		assert.equal(clockAt('dawn', 0), '03:00');
		assert.equal(clockAt('dawn', 1), '05:43');
		assert.equal(dawnMinute(1 / 3), 28 * 60);
		assert.equal(auroraAlpha(27 * 60), 0.8);
		assert.equal(auroraAlpha(28 * 60), 0);
		let previous = Number.NEGATIVE_INFINITY;
		for (let step = 0; step <= 20; step += 1) {
			const frame = frameAt(index, step / 20);
			assert.equal(frame.kind, 'dawn');
			if (frame.kind === 'dawn') {
				assert.ok(frame.minute >= previous, '시각이 되돌아감');
				previous = frame.minute;
			}
		}
	});

	test('에필로그: 물속 암전 → 23:40 별하늘(배 없음)', () => {
		const index = indexOf('epilogue');
		assert.deepEqual(frameAt(index, 0, 0.5), { kind: 'dive', depth: 0.5 });
		const sky = frameAt(index, 1, 1);
		assert.equal(sky.kind, 'night');
		if (sky.kind === 'night') {
			assert.equal(sky.ship, false);
			assert.equal(sky.minute, 23 * 60 + 40);
			assert.equal(sky.veil, 0);
		}
	});

	test('1장: 배 없음 · 별 0.5배', () => {
		const frame = frameAt(indexOf('now'), 1);
		assert.equal(frame.kind, 'night');
		if (frame.kind === 'night') assert.deepEqual([frame.ship, frame.starAlpha], [false, 0.5]);
	});

	test('동작 줄이기: 장마다 정지 구도(검은 막 없음)', () => {
		CHAPTERS.forEach((_, index) => {
			const frame = stillFrameAt(index);
			assert.ok(frame.kind !== 'dive' && frame.veil === 0, CHAPTERS[index].id);
		});
	});
});

describe('하늘 자료(static/stories/titanic/sky)', () => {
	const sky: SkyData | null = parseSkyData(
		readStatic(SKY_FILES.stars),
		readStatic(SKY_FILES.bodies)
	);

	test('별 5,041개 · 기준 항성시 23:40', () => {
		assert.ok(sky !== null);
		assert.equal(sky.stars.length, 5041);
		assert.equal(sky.lstReferenceMinute, 23 * 60 + 40);
		assert.equal(minutesFromAts('1912-04-15 05:43'), DAWN_END);
	});

	test('05:43 금성은 수평선 위(마지막 별), 해는 아직 아래', () => {
		assert.ok(sky !== null);
		assert.ok(bodyAt(sky, DAWN_END, 'venus').alt > 5);
		assert.ok(bodyAt(sky, DAWN_END, 'sun').alt < 0);
	});

	test('형식이 다른 자료는 null', () => {
		assert.equal(parseSkyData({ stars: [[1, 2, 3]] }, readStatic(SKY_FILES.bodies)), null);
		assert.equal(parseSkyData(readStatic(SKY_FILES.stars), { dense: [] }), null);
	});
});
