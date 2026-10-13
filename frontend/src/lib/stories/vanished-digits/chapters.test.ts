// 사라진 세 자리 원고 · 길이(chapters · storyText) 테스트(node:test).
// 시제품 확정값: 문장 170(+표지 2) · 표지 260vh · 끝 화면 150vh · 3-3 740 → 1018.7vh(+278.7) · 트랙 + 끝 여백 14178.7vh(390×844 에서 119,668px).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { splitSentences } from '../../story/sentences.ts';
import { computeMain, computeWeather, skyAnchors } from './chaosCompute.ts';
import {
	beatAt,
	beatAtVh,
	beatById,
	BEATS,
	CHAPTER_VH,
	CHAPTERS,
	COVER,
	END_VH,
	FINALE_VH,
	SENTENCE_MIN_VH,
	SKY33_BEAT,
	SKY33_PAUSE_VH,
	SKY33_RATE_PER_VH,
	SKY33_SCHEDULE,
	TRACK_ENTRIES
} from './chapters.ts';
import { badgeOf, CHAPTER_TEXTS, COVER_TEXT } from './storyText.ts';

// 장마다 한 줄로 둔다
// prettier-ignore
const EXPECTED_BEATS = [
	'1-1', '1-2', '1-3',
	'2-1', '2-2', '2-3', '2-4', '2-5', '2-6',
	'3-1', '3-2', '3-3', '3-4', '3-5',
	'4-1', '4-2', '4-3', '4-4', '4-5',
	'5-1', '5-2', '5-3', '5-4',
	'6-1', '6-2', '6-3', '6-4',
	'7-1', '7-2', '7-3', '7-4', '7-5'
];
const EXPECTED_SENTENCES = 170;
const EXPECTED_COVER_SENTENCES = 2;
const BEAT_EXTRA_VH = 80;
const VH_EPSILON = 1e-9;
// 시간표는 0.1vh 올림으로 정했다(시제품 STEP 139)
const SCHEDULE_ROUNDING_VH = 0.1;

function beatText(id: string): string {
	return beatById(id).text;
}

function sentenceRangeVh(id: string, sentence: number): [number, number] {
	const beat = beatById(id);
	return [beatAt(id, sentence, 0) * beat.totalVh, beatAt(id, sentence, 1) * beat.totalVh];
}

describe('원고 v4.2', () => {
	test('7장 32비트(시제품 순서)', () => {
		assert.equal(CHAPTER_TEXTS.length, 7);
		assert.deepEqual(
			BEATS.map((beat) => beat.id),
			EXPECTED_BEATS
		);
		assert.deepEqual(
			CHAPTERS.map((chapter) => chapter.title),
			[
				'열하루째',
				'아무도 보지 않던 한 시간',
				'0.506',
				'나비 모양의 길',
				'먼저 넘어진 사람',
				'갈매기에서 나비로',
				'쉰한 개의 내일'
			]
		);
	});

	test('사실 정정 2건: 5-2 1885년 · 7-3 반세기도 더 전', () => {
		assert.ok(beatText('5-2').startsWith('1885년, 스웨덴과 노르웨이의 왕'));
		assert.ok(beatText('7-3').includes('반세기도 더 전 출력지 앞에서 시작된 물음'));
		const all = [COVER_TEXT, ...BEATS.map((beat) => beat.text)].join('\n');
		assert.ok(!all.includes('1888'));
		assert.ok(!all.includes('60여 년'));
	});

	test('문장 170(+표지 2), 문장 + 구분 공백을 이으면 원문과 같다', () => {
		for (const beat of BEATS) {
			const rejoined = beat.sentences.map((sentence, index) => sentence + beat.separators[index]);
			assert.equal(rejoined.join(''), beat.text, beat.id);
		}
		const total = BEATS.reduce((sum, beat) => sum + beat.sentences.length, 0);
		assert.equal(total, EXPECTED_SENTENCES);
		assert.equal(COVER.sentences.length, EXPECTED_COVER_SENTENCES);
		assert.deepEqual(COVER.sentences, splitSentences(COVER_TEXT).sentences);
	});

	test('3-3 은 11문장, 문장 6 · 7 은 하늘 장면 문장', () => {
		const { sentences } = beatById(SKY33_BEAT);
		assert.equal(sentences.length, 11);
		assert.ok(sentences[6].startsWith('열흘째에도, 스무째 날에도'));
		assert.ok(sentences[7].startsWith('그런데 예순째 날 아침'));
	});

	test('배지: 2-4 · 3-3 · 7-5 상상, 5-3 일부 상상, 7-5 맺음 문장 제외', () => {
		assert.equal(badgeOf('2-4', 0, 7), '상상');
		assert.equal(badgeOf('3-3', 10, 11), '상상');
		assert.equal(badgeOf('5-3', 0, 6), '일부 상상');
		assert.equal(badgeOf('7-5', 3, 5), '상상');
		assert.equal(badgeOf('7-5', 4, 5), null);
		assert.equal(badgeOf('1-1', 0, 6), null);
	});
});

describe('길이(시제품 공식)', () => {
	test('표지 260vh(그림 120 + 문장 2 × 60 + 20), 글은 120vh 부터', () => {
		assert.equal(COVER.totalVh, 260);
		assert.equal(COVER.textStart, 120 / 260);
		assert.equal(COVER.cuts[COVER.cuts.length - 1], 1);
	});

	test('비트 = 문장 수 × 60 + 80 (+ 3-3 추가 길이), 문장 구간은 모두 60vh 이상', () => {
		for (const beat of BEATS) {
			const expected = beat.sentences.length * SENTENCE_MIN_VH + BEAT_EXTRA_VH + beat.addedVh;
			assert.ok(Math.abs(beat.totalVh - expected) < VH_EPSILON, beat.id);
			assert.equal(beat.cuts[beat.cuts.length - 1], 1, beat.id);
			beat.sentences.forEach((_, index) => {
				const [start, end] = sentenceRangeVh(beat.id, index);
				assert.ok(end - start >= SENTENCE_MIN_VH - VH_EPSILON, `${beat.id} 문장 ${index}`);
			});
			if (beat.id !== SKY33_BEAT) assert.equal(beat.addedVh, 0, beat.id);
		}
	});

	test('3-3 740 → 1018.7vh(+278.7)', () => {
		const sky = beatById(SKY33_BEAT);
		assert.ok(Math.abs(sky.addedVh - 278.7) < 0.01, String(sky.addedVh));
		assert.ok(Math.abs(sky.totalVh - 1018.7) < 0.01, String(sky.totalVh));
	});

	test('트랙: 표지 · (장 제목 90 · 비트) × 7 · 끝 화면 150, 끝 여백 포함 14178.7vh', () => {
		assert.equal(TRACK_ENTRIES.length, 1 + 7 + 32 + 1);
		assert.equal(TRACK_ENTRIES[0].kind, 'cover');
		assert.equal(TRACK_ENTRIES[1].kind, 'chapter');
		assert.equal(TRACK_ENTRIES[1].vh, CHAPTER_VH);
		const last = TRACK_ENTRIES[TRACK_ENTRIES.length - 1];
		assert.equal(last.kind, 'finale');
		assert.equal(last.vh, FINALE_VH);
		const total = TRACK_ENTRIES.reduce((sum, entry) => sum + entry.vh, 0) + END_VH;
		assert.ok(Math.abs(total - 14178.7) < 0.01, String(total));
	});
});

describe('3-3 하늘 시간표 이식 정합', () => {
	test('0→20일은 문장 6 안, 20→60일은 문장 7 안', () => {
		const [start6, end6] = sentenceRangeVh(SKY33_BEAT, 6);
		const [start7, end7] = sentenceRangeVh(SKY33_BEAT, 7);
		for (const span of SKY33_SCHEDULE) {
			const [start, end] = span.toDay <= 20 ? [start6, end6] : [start7, end7];
			assert.ok(span.startVh >= start && span.endVh <= end, `${span.fromDay}~${span.toDay}일`);
		}
	});

	test('구간 사이 멈춤 15vh, 비트 진행값으로 바꾸면 0~1 안', () => {
		for (let index = 1; index < SKY33_SCHEDULE.length; index++) {
			const gap = SKY33_SCHEDULE[index].startVh - SKY33_SCHEDULE[index - 1].endVh;
			assert.ok(Math.abs(gap - SKY33_PAUSE_VH) < VH_EPSILON, `${index}번째 멈춤 ${gap}`);
		}
		const lastEnd = beatAtVh(SKY33_BEAT, SKY33_SCHEDULE[SKY33_SCHEDULE.length - 1].endVh);
		assert.ok(lastEnd > 0 && lastEnd < 1);
	});

	test('구간 길이 = 두 언덕 중 큰 맑음 변화 ÷ 1vh 당 0.008(0.1vh 올림)', () => {
		const weather = computeWeather(computeMain());
		const top = skyAnchors(weather, 'base');
		const bottom = skyAnchors(weather, 'copy');
		for (const span of SKY33_SCHEDULE) {
			const from = span.fromDay / 10;
			const to = span.toDay / 10;
			const change = Math.max(Math.abs(top[to] - top[from]), Math.abs(bottom[to] - bottom[from]));
			const needed = change / SKY33_RATE_PER_VH;
			const length = span.endVh - span.startVh;
			assert.ok(
				length >= needed - VH_EPSILON && length <= needed + SCHEDULE_ROUNDING_VH + VH_EPSILON,
				`${span.fromDay}~${span.toDay}일: ${length} (필요 ${needed})`
			);
		}
	});
});
