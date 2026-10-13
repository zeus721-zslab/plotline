// 사라진 세 자리 문구-데이터 대조(storyChecks · screenFigures) 테스트(node:test).
// 판 번호는 하드코딩하지 않고 static/data/stories/vanished-digits.json 의 datasets[].path 를 따라간다(stories/storyChecks.test.ts 와 같은 방식).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
	isPublishedDataset,
	isPublishedStory,
	type PublishedDataset
} from '../../story/published.ts';
import { FULL_VALUE, PAIR_DELTA_X, TRUNCATED_VALUE } from './chaosCompute.ts';
import { buildChaosData, DIGIT_VALUE_SCALE, screenFigures } from './chaosData.ts';
import { CHAOS_DATASET, CHAOS_STORY } from './chaosStory.ts';
import {
	BAR_TARGET,
	CALENDAR_TARGET,
	COVER_TARGET,
	ENSEMBLE_CAPTION_TARGET,
	ENSEMBLE_TARGET,
	FULL_VALUE_TARGET,
	PRINTED_VALUE_TARGET,
	storyMismatches,
	WEATHER_CAPTION_TARGET,
	yearMarkTarget
} from './storyChecks.ts';

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function readDataset(): PublishedDataset {
	const story = readJson(`../../../../static/data/stories/${CHAOS_STORY}.json`);
	assert.ok(isPublishedStory(story));
	const reference = story.datasets[CHAOS_DATASET];
	assert.ok(reference !== undefined, `${CHAOS_DATASET} not referenced`);
	const raw = readJson(`../../../../static${reference.path}`);
	assert.ok(isPublishedDataset(raw));
	return raw;
}

const eventsRaw = readDataset();

function clone(dataset: PublishedDataset): PublishedDataset {
	return structuredClone(dataset);
}

function changed(key: string, field: string, value: number): PublishedDataset {
	const copy = clone(eventsRaw);
	const row = copy.rows.find((candidate) => candidate.key === key);
	assert.ok(row !== undefined, key);
	row.values[field] = value;
	return copy;
}

function targets(events: PublishedDataset): string[] {
	const data = buildChaosData(events);
	assert.ok(data !== null);
	return [...new Set(storyMismatches(data).map((mismatch) => mismatch.target))].sort();
}

describe('8편 사라진 세 자리 — 문구-데이터 대조', () => {
	test('불일치 0(로컬 사본 lorenz_chaos v1, 표지 · 비트 글 · 연도 표지 · 그림 숫자 · 캡션)', () => {
		assert.equal(eventsRaw.rows.length, 25);
		assert.deepEqual(targets(eventsRaw), []);
	});

	// [대조 종류 · 문구, 바꿀 줄, 칸, 값, 숨겨져야 할 대상(그것들만)]
	for (const [claim, key, field, value, expected] of [
		[
			'date · years-after: 1961년 겨울 · 70여 년 · 반세기도 더 전',
			'lorenz_rerun',
			'year',
			1972,
			[
				COVER_TARGET,
				'1-3',
				'5-1',
				'5-4',
				'7-3',
				'7-5',
				yearMarkTarget('1-3'),
				yearMarkTarget('5-4'),
				yearMarkTarget('7-5')
			]
		],
		[
			'date: 1885년(5-2) · 연도 표지',
			'prize_announced',
			'year',
			1888,
			['5-2', yearMarkTarget('5-1')]
		],
		['month-in: 1889년 12월', 'poincare_retract', 'month', 11, ['5-3']],
		['years-after: 이듬해', 'poincare_revised', 'year', 1891, ['5-4']],
		['year-between: 1960년대 말', 'lorenz_two_weeks', 'year', 1970, ['7-3']],
		[
			'month-in: 1972년 12월 · 연도 표지',
			'butterfly_talk',
			'year',
			1973,
			['6-2', yearMarkTarget('6-2')]
		],
		['date: 2019년', 'limit_study', 'year', 2010, ['7-3']],
		['date: 1963년 무렵 갈매기', 'gull_lecture', 'year', 1964, ['6-1']],
		[
			'date: 1963년 논문 · 연도 표지 · 캡션',
			'lorenz_paper',
			'year',
			1964,
			['4-5', yearMarkTarget('4-5'), WEATHER_CAPTION_TARGET]
		],
		[
			'value · difference: 0.506127',
			'true_value',
			'value',
			506128,
			['3-1', '3-2', '3-3', FULL_VALUE_TARGET]
		],
		[
			'value · difference: 0.506',
			'printed_value',
			'value',
			506100,
			['3-1', '3-2', '3-3', PRINTED_VALUE_TARGET]
		],
		[
			'value · near-value: 4천분의 1 · 4096배',
			'diff_ratio',
			'value',
			3000,
			['3-2', '3-4', BAR_TARGET]
		],
		['near-value: 4096배(±15%)만', 'diff_ratio', 'value', 3550, ['3-4']],
		['value: 진공관 백여 개', 'vacuum_tubes', 'value', 200, ['2-2']],
		['value: 열두 개의 식', 'equations_full', 'value', 13, ['2-2', '4-1']],
		[
			'value: 세 개의 식 · 캡션',
			'equations_simple',
			'value',
			4,
			['4-1', '4-2', WEATHER_CAPTION_TARGET, ENSEMBLE_CAPTION_TARGET]
		],
		['value · ratio: 1분에 하루', 'minutes_per_day', 'value', 2, ['2-2', '2-4']],
		['ratio: 한 시간이면 예순 날', 'coffee_minutes', 'value', 90, ['2-4']],
		['value: 예순 날', 'rerun_days', 'value', 61, ['2-4']],
		['value: 세 번뿐', 'outside_citations', 'value', 4, ['4-5']],
		['value: 만 번 넘게', 'total_citations', 'value', 9000, ['6-1']],
		[
			'value: 쉰한 번 · 51줄기 · 캡션',
			'ensemble_members',
			'value',
			52,
			['7-1', '7-2', ENSEMBLE_TARGET, ENSEMBLE_CAPTION_TARGET]
		],
		['value: 쉰 번', 'ensemble_perturbed', 'value', 49, ['7-1', ENSEMBLE_TARGET]],
		['value: 10년마다 하루', 'gain_days_per_decade', 'value', 2, ['7-3']],
		['value: 2주 · 열나흘째 · 날짜 칸', 'limit_days', 'value', 15, ['7-3', '7-4', CALENDAR_TARGET]],
		['value: 열흘 · 날짜 칸', 'reliable_days', 'value', 11, ['1-1', '7-4', CALENDAR_TARGET]]
	] as const) {
		test(`${claim}: ${key}.${field} = ${value} 이면 ${expected.join(', ')} 만 숨김`, () => {
			assert.deepEqual(targets(changed(key, field, value)), [...expected].sort());
		});
	}

	test('줄 삭제: 나비 강연 줄이 없으면 6-2 · 연도 표지 숨김', () => {
		const removed = clone(eventsRaw);
		removed.rows = removed.rows.filter((row) => row.key !== 'butterfly_talk');
		assert.deepEqual(targets(removed), ['6-2', yearMarkTarget('6-2')]);
	});

	test('수량 칸이 정수가 아니면 해석 실패(null)', () => {
		assert.equal(buildChaosData(changed('true_value', 'value', 506127.5)), null);
	});
});

describe('8편 화면 숫자(screenFigures) — 데이터에서 읽는다', () => {
	test('로컬 사본 기준 값', () => {
		const data = buildChaosData(eventsRaw);
		assert.ok(data !== null);
		assert.deepEqual(screenFigures(data), {
			fullValueText: '0.506127',
			printedValueText: '0.506',
			reliableDays: 10,
			limitDays: 14,
			ensembleMembers: 51,
			years: {
				lorenz_rerun: 1961,
				lorenz_paper: 1963,
				prize_announced: 1885,
				poincare_retract: 1889,
				butterfly_talk: 1972
			},
			barShortMm: 0.25
		});
	});

	test('데이터를 바꾸면 화면 숫자도 바뀐다(상수가 아님)', () => {
		const data = buildChaosData(changed('prize_announced', 'year', 1888));
		assert.ok(data !== null);
		assert.equal(screenFigures(data).years.prize_announced, 1888);
	});

	test('그림 계산 상수(0.506127 · 0.506 · 0.000127)가 데이터 값과 같다', () => {
		const data = buildChaosData(eventsRaw);
		assert.ok(data !== null);
		const valueOf = (key: 'true_value' | 'printed_value'): number | null => {
			const found = data.events.get(key);
			return found === undefined ? null : found.value;
		};
		assert.equal(Math.round(FULL_VALUE * DIGIT_VALUE_SCALE), valueOf('true_value'));
		assert.equal(Math.round(TRUNCATED_VALUE * DIGIT_VALUE_SCALE), valueOf('printed_value'));
		assert.equal(
			Math.round(PAIR_DELTA_X * DIGIT_VALUE_SCALE),
			Math.round((FULL_VALUE - TRUNCATED_VALUE) * DIGIT_VALUE_SCALE)
		);
	});

	test('줄이 없으면 null', () => {
		const removed = clone(eventsRaw);
		removed.rows = removed.rows.filter((row) => row.key !== 'ensemble_members');
		const data = buildChaosData(removed);
		assert.ok(data !== null);
		assert.equal(screenFigures(data).ensembleMembers, null);
	});
});
