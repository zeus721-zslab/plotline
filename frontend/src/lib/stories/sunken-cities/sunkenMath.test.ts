// 바다 밑의 도시들 계산 단위 테스트(node:test, 의존성 없음).
// 대표 연도는 static/data 의 운영 확정 사본(sunken-cities.json 이 가리키는 판)으로 계산한다.
// 실행: docker compose exec frontend node --test src/lib/stories/sunken-cities/sunkenMath.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
	isPublishedDataset,
	isPublishedStory,
	type PublishedDataset
} from '../../story/published.ts';
import { buildSunkenData, type SunkenData } from './sunkenData.ts';
import { representativeYear, yearPointOf, yearsAgoText } from './sunkenMath.ts';

// 계산 기준 해(고정): "잠긴 지" 반올림 규칙을 해가 바뀌어도 같은 값으로 확인한다.
const YEAR = 2026;
const STATIC_ROOT = '../../../../static';

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(new URL(`${STATIC_ROOT}${path}`, import.meta.url), 'utf8'));
}

// 판 번호는 하드코딩하지 않고 이야기 파일의 datasets[name].path 를 따라간다.
function readDataset(name: string): PublishedDataset {
	const story = readJson('/data/stories/sunken-cities.json');
	assert.ok(isPublishedStory(story));
	const ref = story.datasets[name];
	assert.ok(ref !== undefined, name);
	const raw = readJson(ref.path);
	assert.ok(isPublishedDataset(raw), name);
	return raw;
}

function staticData(): SunkenData {
	const data = buildSunkenData(
		readDataset('atlantis_criteria'),
		readDataset('sunken_places'),
		readDataset('sunken_measures')
	);
	assert.ok(data !== null);
	return data;
}

describe('장소 대표 연도', () => {
	test('범위는 가운데, 하나면 그 해', () => {
		const base = {
			place: 'baiae' as const,
			measure: 'submerge_start' as const,
			amountMin: null,
			amountMax: null,
			verdict: null,
			certainty: 'confirmed' as const,
			noteKo: ''
		};
		assert.deepEqual(yearPointOf({ ...base, yearFrom: 300, yearTo: 399 }), {
			year: 349.5,
			range: true
		});
		assert.deepEqual(yearPointOf({ ...base, yearFrom: 1692, yearTo: null }), {
			year: 1692,
			range: false
		});
		assert.equal(yearPointOf(null), null);
	});

	test('다 잠긴 때가 있으면 그 줄, 없으면 잠기기 시작한 때, 둘 다 없으면 없음', () => {
		const data = staticData();
		assert.equal(representativeYear(data, 'heracleion')?.year, 749.5);
		assert.equal(representativeYear(data, 'baiae')?.year, 349.5);
		assert.equal(representativeYear(data, 'doggerland')?.year, -5000);
		assert.equal(representativeYear(data, 'port_royal')?.year, 1692);
		assert.equal(representativeYear(data, 'pavlopetri'), null);
		assert.equal(representativeYear(data, 'lyonesse'), null);
	});
});

describe('"잠긴 지" 반올림', () => {
	test('1,000년 이상은 100 단위', () => {
		assert.equal(yearsAgoText(YEAR, { year: -5000, range: false }), '약 7,000년');
		assert.equal(yearsAgoText(YEAR, { year: 749.5, range: true }), '약 1,300년');
		assert.equal(yearsAgoText(YEAR, { year: -9600, range: false }), '약 1만 1,600년');
	});

	test('1,000년 미만 단일 연도는 그대로', () => {
		assert.equal(yearsAgoText(YEAR, { year: 1692, range: false }), '334년');
	});

	test('1,000년 미만 범위는 10 단위', () => {
		assert.equal(yearsAgoText(YEAR, { year: 1749.5, range: true }), '약 280년');
	});
});
