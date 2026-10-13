// 공용 문구 대조 달력 종류(calendarClaimProblem: date · month-in) 테스트(node:test, D-47 D4).
// 기존 종류(years-after · value · scaled-value)는 6 · 7편 대조 테스트(stories/storyChecks.test.ts)가 확인한다.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { calendarClaimProblem, type CalendarClaim } from './eventClaims.ts';
import type { EventRecord } from './eventData.ts';

type Id = 'talk' | 'paper';

function events(...records: [Id, EventRecord][]): Map<Id, EventRecord> {
	return new Map(records);
}

const TALK_1972_DECEMBER: EventRecord = { year: 1972, month: 12, day: 29, value: null };
const PAPER_1963: EventRecord = { year: 1963, month: null, day: null, value: null };

describe('calendarClaimProblem — date(연도만)', () => {
	test('연도가 같으면 맞음(월 · 일은 보지 않는다)', () => {
		const data = events(['talk', TALK_1972_DECEMBER], ['paper', PAPER_1963]);
		assert.equal(calendarClaimProblem({ kind: 'date', event: 'paper', year: 1963 }, data), null);
		assert.equal(calendarClaimProblem({ kind: 'date', event: 'talk', year: 1972 }, data), null);
	});

	test('연도가 다르면 이유', () => {
		const data = events(['paper', PAPER_1963]);
		assert.equal(
			calendarClaimProblem({ kind: 'date', event: 'paper', year: 1964 }, data),
			'paper: year differs'
		);
	});

	test('사건 줄이 없으면 이유', () => {
		assert.equal(
			calendarClaimProblem({ kind: 'date', event: 'paper', year: 1963 }, events()),
			'paper: year differs'
		);
	});
});

describe('calendarClaimProblem — month-in', () => {
	function monthIn(months: number[]): CalendarClaim<Id> {
		return { kind: 'month-in', event: 'talk', year: 1972, months };
	}

	test('연도가 같고 월이 목록 안이면 맞음', () => {
		assert.equal(calendarClaimProblem(monthIn([12]), events(['talk', TALK_1972_DECEMBER])), null);
		assert.equal(
			calendarClaimProblem(monthIn([12, 1, 2]), events(['talk', TALK_1972_DECEMBER])),
			null
		);
	});

	test('월이 목록 밖이면 이유', () => {
		const data = events(['talk', { ...TALK_1972_DECEMBER, month: 11 }]);
		assert.equal(calendarClaimProblem(monthIn([12]), data), 'talk: month not in 12');
	});

	test('연도가 다르면 이유', () => {
		const data = events(['talk', { ...TALK_1972_DECEMBER, year: 1973 }]);
		assert.equal(calendarClaimProblem(monthIn([12]), data), 'talk: month not in 12');
	});

	test('월 칸이 없으면 이유', () => {
		const data = events(['talk', { ...TALK_1972_DECEMBER, month: null }]);
		assert.equal(calendarClaimProblem(monthIn([12]), data), 'talk: month not in 12');
	});

	test('사건 줄이 없으면 이유', () => {
		assert.equal(calendarClaimProblem(monthIn([12]), events()), 'talk: month not in 12');
	});
});
