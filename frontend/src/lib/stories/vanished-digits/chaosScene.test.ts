// 사라진 세 자리 장면 상태(chaosScene · 연도 굴림 자리) 테스트(node:test).
// 시제품 확정값: 3-3 하늘 시간표(STEP 139~141) · 연도 굴림(D-47 정정: 5-1 1963→1885 · 5-3 1885→1889) · 7-5 맺음 문장 배지 없음 · 문장당 60vh 이상.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { computeMain, computeWeather, skyAnchors } from './chaosCompute.ts';
import { yearStripPositions } from './chaosPaint.ts';
import {
	beatAtVh,
	beatById,
	BEATS,
	COVER,
	SENTENCE_MIN_VH,
	SKY33_BEAT,
	SKY33_RATE_PER_VH,
	SKY33_SCHEDULE,
	TRACK_ENTRIES
} from './chapters.ts';
import {
	COVER_STILL,
	markAt,
	REDUCED_P,
	sky33Knots,
	SKY33_FADE_VH,
	stillPosition,
	subtitleAt,
	valleyState33,
	yearAt,
	yearOfBeat,
	type TrackPosition,
	type YearValues
} from './chaosScene.ts';
import { yearMarkTarget } from './storyChecks.ts';
import { IMAGINED_BADGE } from './storyText.ts';

const EPSILON = 1e-9;
// 진행값을 문장 경계 바로 안쪽으로 옮기는 폭
const NUDGE = 1e-6;
const NO_HIDDEN: ReadonlySet<string> = new Set();
// 데이터 묶음 lorenz_chaos v1 의 연도(chaosData screenFigures.years)
const YEARS: YearValues = {
	lorenz_rerun: 1961,
	lorenz_paper: 1963,
	prize_announced: 1885,
	poincare_retract: 1889,
	butterfly_talk: 1972
};

function beatIndex(id: string): number {
	const index = TRACK_ENTRIES.findIndex((entry) => entry.kind === 'beat' && entry.beatId === id);
	assert.ok(index >= 0, id);
	return index;
}

function at(id: string, p: number): TrackPosition {
	return { index: beatIndex(id), p };
}

function yearValue(id: string, p: number): number {
	const state = yearOfBeat(id, p, YEARS);
	assert.ok(state !== null, `${id} @ ${p}`);
	return state.value;
}

describe('3-3 하늘 시간표 값', () => {
	const weather = computeWeather(computeMain());
	const topAnchors = skyAnchors(weather, 'base');
	const bottomAnchors = skyAnchors(weather, 'copy');
	const sky = { top: sky33Knots(topAnchors), bottom: sky33Knots(bottomAnchors) };
	const state = (vh: number): ReturnType<typeof valleyState33> =>
		valleyState33(beatAtVh(SKY33_BEAT, vh), sky);

	test('날 수: 구간 시작 vh 에서 시작 날, 끝 vh 에서 끝 날, 구간 사이 멈춤에서는 그대로', () => {
		for (const [index, span] of SKY33_SCHEDULE.entries()) {
			assert.ok(Math.abs(state(span.startVh).day - span.fromDay) < EPSILON, `${span.fromDay}일`);
			assert.ok(Math.abs(state(span.endVh).day - span.toDay) < EPSILON, `${span.toDay}일`);
			const next = SKY33_SCHEDULE[index + 1];
			if (next !== undefined)
				assert.ok(Math.abs(state((span.endVh + next.startVh) / 2).day - span.toDay) < EPSILON);
		}
	});

	test('맑음: 구간 시작에서 앞 대표값, 1vh 당 0.008 로 바뀌어 다음 대표값에서 멈춘다(위 · 아래 언덕)', () => {
		for (const span of SKY33_SCHEDULE) {
			const from = span.fromDay / 10;
			const to = span.toDay / 10;
			assert.ok(Math.abs(state(span.startVh).top - topAnchors[from]) < EPSILON);
			assert.ok(Math.abs(state(span.startVh).bottom - bottomAnchors[from]) < EPSILON);
			assert.ok(Math.abs(state(span.endVh).top - topAnchors[to]) < EPSILON);
			assert.ok(Math.abs(state(span.endVh).bottom - bottomAnchors[to]) < EPSILON);
		}
		// 1vh 훑기: 맑음 변화는 어디서도 1vh 당 0.008 을 넘지 않는다
		const totalVh = beatById(SKY33_BEAT).totalVh;
		let previous = state(0);
		for (let vh = 1; vh <= totalVh; vh++) {
			const current = state(vh);
			assert.ok(Math.abs(current.top - previous.top) <= SKY33_RATE_PER_VH + EPSILON, `위 ${vh}vh`);
			assert.ok(
				Math.abs(current.bottom - previous.bottom) <= SKY33_RATE_PER_VH + EPSILON,
				`아래 ${vh}vh`
			);
			previous = current;
		}
	});

	test('끝 페이드아웃: 비트 끝 40vh 앞까지 1, 비트 끝에서 0', () => {
		const totalVh = beatById(SKY33_BEAT).totalVh;
		assert.equal(state(totalVh - SKY33_FADE_VH).fade, 1);
		assert.equal(state(totalVh).fade, 0);
		const lastScheduled = SKY33_SCHEDULE[SKY33_SCHEDULE.length - 1].endVh;
		assert.equal(state(lastScheduled).fade, 1);
	});
});

describe('연도 굴림', () => {
	test('순서 1963 → 1885 → 1889 → 1961(4-5 끝 · 5-1 · 5-3 · 5-4)', () => {
		assert.equal(yearValue('4-5', 1), 1963);
		assert.equal(yearValue('5-1', 0), 1963);
		assert.equal(yearValue('5-1', 1), 1885);
		assert.equal(yearValue('5-2', 0.5), 1885);
		assert.equal(yearValue('5-3', 0), 1885);
		assert.equal(yearValue('5-3', 1), 1889);
		assert.equal(yearValue('5-4', 0), 1889);
		assert.equal(yearValue('5-4', 1), 1961);
	});

	test('5-3 은 1885 → 1889 로 한 방향으로만 굴러간다(옛 1888+1 굴림 아님)', () => {
		let previous = yearValue('5-3', 0);
		for (let step = 1; step <= 1000; step++) {
			const value = yearValue('5-3', step / 1000);
			assert.ok(value >= previous - EPSILON, `p ${step / 1000}`);
			previous = value;
		}
		assert.equal(previous, 1889);
	});

	test('7-5: 1961 로 굴렀다가 맺음 문장에서 다시 오늘', () => {
		const beat = beatById('7-5');
		const middle = yearOfBeat('7-5', (beat.cuts[0] + beat.cuts[1]) / 2, YEARS);
		const closing = yearOfBeat('7-5', 1, YEARS);
		assert.ok(middle !== null && closing !== null);
		assert.equal(middle.value, 1961);
		assert.equal(middle.word, 0);
		assert.equal(closing.word, 1);
	});

	test('쓰는 데이터 연도가 없거나 연도 표지가 대조에서 어긋나면 숨긴다', () => {
		assert.equal(yearOfBeat('5-3', 0.5, { ...YEARS, poincare_retract: null }), null);
		assert.equal(yearAt(at('5-3', 0.5), YEARS, new Set([yearMarkTarget('5-3')])), null);
		assert.notEqual(yearAt(at('5-3', 0.5), YEARS, NO_HIDDEN), null);
		// 표지에서는 연도를 두지 않는다
		assert.equal(yearAt({ index: 0, p: 0.5 }, YEARS, NO_HIDDEN), null);
	});

	test('굴림 자리: 아랫자리가 모두 9 일 때만 윗자리도 함께 넘어간다', () => {
		assert.deepEqual(yearStripPositions(1961), [1, 9, 6, 1]);
		assert.deepEqual(yearStripPositions(1889.5), [1, 8, 8.5, 9.5]);
		assert.deepEqual(yearStripPositions(1885.25), [1, 8, 8, 5.25]);
	});
});

describe('자막 · 배지', () => {
	test('7-5 는 상상 배지, 맺음 문장에서만 숨긴다', () => {
		const beat = beatById('7-5');
		const last = beat.sentences.length - 1;
		for (let sentence = 0; sentence < last; sentence++) {
			const start = sentence === 0 ? 0 : beat.cuts[sentence - 1];
			const subtitle = subtitleAt(at('7-5', (start + beat.cuts[sentence]) / 2), NO_HIDDEN);
			assert.equal(subtitle.kicker, IMAGINED_BADGE, `문장 ${sentence}`);
		}
		const closing = subtitleAt(at('7-5', 1), NO_HIDDEN);
		assert.equal(closing.kicker, '');
		assert.equal(closing.text, beat.sentences[last]);
	});

	test('대조가 어긋난 비트는 글 · 배지를 비운다', () => {
		const subtitle = subtitleAt(at('3-3', 0.5), new Set(['3-3']));
		assert.equal(subtitle.text, '');
		assert.equal(subtitle.kicker, '');
	});

	test('문장 구간: 모든 비트 · 표지 문장이 60vh 이상이고, 구간 안에서는 그 문장만 보인다', () => {
		for (const beat of BEATS) {
			beat.sentences.forEach((sentence, index) => {
				const start = index === 0 ? 0 : beat.cuts[index - 1];
				const end = beat.cuts[index];
				assert.ok((end - start) * beat.totalVh >= SENTENCE_MIN_VH - EPSILON, `${beat.id} ${index}`);
				for (const p of [start + NUDGE, (start + end) / 2, end - NUDGE])
					assert.equal(subtitleAt(at(beat.id, p), NO_HIDDEN).text, sentence, `${beat.id} ${index}`);
			});
		}
		COVER.sentences.forEach((sentence, index) => {
			const start = index === 0 ? COVER.textStart : COVER.cuts[index - 1];
			const end = COVER.cuts[index];
			assert.ok((end - start) * COVER.totalVh >= SENTENCE_MIN_VH - EPSILON, `표지 ${index}`);
			assert.equal(subtitleAt({ index: 0, p: (start + end) / 2 }, NO_HIDDEN).text, sentence);
		});
		// 표지 그림 구간에는 글이 없다
		assert.equal(subtitleAt({ index: 0, p: COVER.textStart - NUDGE }, NO_HIDDEN).text, '');
	});
});

describe('정지 그림 위치 · 표식', () => {
	test('정지 모드는 장 제목 구간을 빼고 구간마다 REDUCED_P 한 장', () => {
		assert.deepEqual(stillPosition(at('2-6', 0.1)), at('2-6', REDUCED_P));
		const chapter = TRACK_ENTRIES.findIndex((entry) => entry.kind === 'chapter');
		assert.deepEqual(stillPosition({ index: chapter, p: 0.3 }), { index: chapter, p: 0.3 });
	});

	test('표지 정지 그림은 0.506 + 제목 + 갈라진 두 실, 비트에서는 표식이 없다', () => {
		const still = markAt({ index: 0, p: 0.1 }, true);
		assert.ok(still !== null);
		assert.deepEqual(still.drops, COVER_STILL.drops);
		assert.equal(still.title, 1);
		assert.equal(still.spread, 1);
		assert.equal(markAt(at('1-1', 0.5), false), null);
	});
});
