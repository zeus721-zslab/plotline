// 넘을 수 없는 선 장면 상태 순수 함수 테스트(node:test, 의존성 없음): 스크롤 구간 → 장면 상태, 문장 구간, 문장 기준 진행값, 자막 · 표기 값.
// 실행: docker compose exec frontend node --test "src/**/*.test.ts"
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BEATS, CHAPTERS, beatHeightVh, yearMarkTarget } from './chapters.ts';
import {
	BEAT_SENTENCES,
	ENTRIES,
	layoutTrack,
	resolveTrack,
	sentenceAt,
	sentenceCuts,
	sentenceIndex,
	sentenceP,
	trackScrollFor
} from './lineScene.ts';
import {
	BEAT_YEARS,
	chapterCardAlpha,
	exitOpacity,
	rollingYear,
	subtitleFrame,
	SUB_ENTER_MS,
	SUB_EXIT_MS,
	YEAR_ROLL_MS,
	yearOf
} from './lineText.ts';

const VIEWPORT_HEIGHT = 844;
const GAP_COUNT = CHAPTERS.length + 1;

function beatIndexOf(id: string): number {
	const index = BEATS.findIndex((entry) => entry.beat.id === id);
	assert.ok(index !== -1, id);
	return index;
}

describe('스크롤 구간', () => {
	const layout = layoutTrack(VIEWPORT_HEIGHT);

	test('구간: 장마다 앞 암전 + 비트, 마지막 장 뒤 암전 하나', () => {
		assert.equal(ENTRIES.length, BEATS.length + GAP_COUNT);
		assert.equal(ENTRIES.filter((entry) => entry.kind === 'gap').length, GAP_COUNT);
		assert.equal(
			layout.total,
			layout.heights.reduce((sum, height) => sum + height, 0)
		);
	});

	test('비트 높이: clamp(80 + 0.9 × 글자 수, 170, 330)vh', () => {
		assert.equal(beatHeightVh('가'.repeat(10)), 170);
		assert.equal(beatHeightVh('가'.repeat(150)), 215);
		assert.equal(beatHeightVh('가'.repeat(400)), 330);
	});

	test('구간 앞은 첫 암전 p 0, 뒤는 마지막 암전 p 1', () => {
		const before = resolveTrack(-100, layout);
		assert.equal(before.kind, 'gap');
		assert.equal(before.entryIndex, 0);
		assert.equal(before.p, 0);
		const after = resolveTrack(layout.total + 100, layout);
		assert.equal(after.entryIndex, ENTRIES.length - 1);
		assert.equal(after.p, 1);
	});

	test('비트 안: s = 장 안 번호 + p, local = 장 첫 비트 윗변부터의 거리', () => {
		const entryIndex = ENTRIES.findIndex(
			(entry) => entry.kind === 'beat' && BEATS[entry.beatIndex].beat.id === '5-4'
		);
		const y = trackScrollFor(entryIndex, 0.5, layout);
		const state = resolveTrack(y, layout);
		assert.equal(state.kind, 'beat');
		if (state.kind !== 'beat') return;
		assert.equal(state.chapter, 5);
		assert.equal(state.index, 3);
		assert.ok(Math.abs(state.p - 0.5) < 1e-9);
		assert.ok(Math.abs(state.s - 3.5) < 1e-9);
		assert.equal(state.local, y - (layout.chapterTops.get(5) ?? Number.NaN));
	});

	test('암전 구간: 앞 장 · 다음 장 번호와 앞 장 local', () => {
		const entryIndex = ENTRIES.findIndex(
			(entry) => entry.kind === 'gap' && entry.prev === 3 && entry.next === 4
		);
		const state = resolveTrack(trackScrollFor(entryIndex, 0.1, layout), layout);
		assert.equal(state.kind, 'gap');
		if (state.kind !== 'gap') return;
		assert.equal(state.prev, 3);
		assert.equal(state.next, 4);
		assert.equal(
			state.prevLocal,
			layout.tops[entryIndex] - (layout.chapterTops.get(3) ?? Number.NaN)
		);
	});
});

describe('문장 구간', () => {
	test('cuts: 가중치 = 글자 수 + 16, 마지막은 1', () => {
		const cuts = sentenceCuts(['가'.repeat(4), '가'.repeat(24)]);
		assert.ok(Math.abs(cuts[0] - 20 / 60) < 1e-12);
		assert.ok(Math.abs(cuts[1] - 1) < 1e-12);
	});

	test('sentenceIndex: 구간 경계에서 다음 문장으로 넘어간다', () => {
		const index = beatIndexOf('7-2');
		const cuts = BEAT_SENTENCES[index].cuts;
		assert.equal(sentenceIndex(index, 0), 0);
		assert.equal(sentenceIndex(index, cuts[0] - 1e-9), 0);
		assert.equal(sentenceIndex(index, cuts[0]), 1);
		assert.equal(sentenceIndex(index, 1), cuts.length - 1);
	});

	test('sentenceAt · sentenceP: 문장 k 의 시작~끝을 0~1 로 본다', () => {
		const cuts = BEAT_SENTENCES[beatIndexOf('3-3')].cuts;
		assert.equal(sentenceAt('3-3', 4, 0), cuts[2]);
		assert.equal(sentenceAt('3-3', 4, 1), cuts[3]);
		assert.equal(sentenceAt('3-3', 1, 0), 0);
		const middle = sentenceAt('3-3', 4, 0.5);
		assert.ok(Math.abs(sentenceP('3-3', 4, middle) - 0.5) < 1e-12);
		assert.equal(sentenceP('3-3', 4, 0), 0);
		assert.equal(sentenceP('3-3', 4, 1), 1);
		// 비율이 0~1 밖이면 그 문장 길이로 앞뒤에 늘려 잡는다
		assert.ok(sentenceAt('5-4', 2, -0.2) < sentenceAt('5-4', 2, 0));
	});

	test('없는 비트 · 문장 번호는 오류', () => {
		assert.throws(() => sentenceAt('0-0', 1, 0));
		assert.throws(() => sentenceAt('5-4', 10, 0));
	});

	test('5-4 그림 문장: 선 1~3 은 2~4번, 채움은 5번, 깨짐은 6번 문장', () => {
		const bell = BEAT_SENTENCES[beatIndexOf('5-4')].sentences;
		assert.ok(bell[1].includes('두 사람의 빨강 답이 같아야'));
		assert.ok(bell[2].includes('왼쪽의 빨강 답과 오른쪽의 파랑 답'));
		assert.ok(bell[3].includes('왼쪽의 파랑 답과 오른쪽의 빨강 답'));
		assert.ok(bell[4].includes('전부 같아진다'));
		assert.ok(bell[5].includes('파랑·파랑에서는 반드시 진다'));
	});
});

describe('자막 · 화면 표기', () => {
	test('새 문장은 SUB_ENTER_MS 안에 연출이 끝나 꾸밈 없이 보인다', () => {
		const start = subtitleFrame('bloom', 0, 0);
		assert.equal(start.opacity, 0);
		assert.notEqual(start.filter, 'none');
		const done = subtitleFrame('bloom', SUB_ENTER_MS, 0);
		assert.equal(done.done, true);
		assert.equal(done.opacity, 1);
		assert.equal(done.filter, 'none');
		assert.equal(done.transform, 'none');
	});

	test('지난 문장은 SUB_EXIT_MS 에 사라진다', () => {
		assert.equal(exitOpacity(0.8, 0), 0.8);
		assert.equal(exitOpacity(1, SUB_EXIT_MS), 0);
	});

	test('연도: 비트마다 이어받고, 바뀌면 YEAR_ROLL_MS 동안 굴러간다', () => {
		assert.equal(BEAT_YEARS[beatIndexOf('2-3')].year, 1905);
		assert.equal(BEAT_YEARS[beatIndexOf('2-3')].target, yearMarkTarget('2-1'));
		assert.equal(BEAT_YEARS[beatIndexOf('8-4')].year, 1982);
		assert.equal(BEAT_YEARS[beatIndexOf('9-3')].year, 2022);
		assert.equal(rollingYear(1982, 1905, 0), 1982);
		assert.equal(rollingYear(1982, 1905, YEAR_ROLL_MS), 1905);
		const gap = { kind: 'gap', entryIndex: 0, p: 0, prev: 0, next: 1, prevLocal: 0 } as const;
		assert.equal(yearOf(gap).year, 1982);
	});

	test('장 제목 카드: 첫 장 앞은 처음부터, 장 사이는 가운데에서만', () => {
		const lead = { kind: 'gap', entryIndex: 0, p: 0, prev: 0, next: 1, prevLocal: 0 } as const;
		assert.equal(chapterCardAlpha(lead), 1);
		const between = { kind: 'gap', entryIndex: 5, p: 0.1, prev: 1, next: 2, prevLocal: 0 } as const;
		assert.equal(chapterCardAlpha(between), 0);
		assert.equal(chapterCardAlpha({ ...between, p: 0.5 }), 1);
	});
});
