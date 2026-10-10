// 이야기 문구-데이터 대조(storyChecks) 테스트(node:test, 의존성 없음).
// 저장소 밖 storycheck.mts 로 수동 실행하던 대조를 PR CI 로 편입한다(D-34).
// 판 번호는 하드코딩하지 않고 static/data/stories/{story}.json 의 datasets[].path 를 따라간다.
// 실행: docker compose exec frontend node --test "src/**/*.test.ts"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { isPublishedDataset, isPublishedStory, type PublishedDataset } from '../story/published.ts';
import { parseStoryImages } from '../story/storyMedia.ts';
import { CHAPTER_ASIDES as BLACK_HOLE_ASIDES } from './black-hole/asides.ts';
import { buildFallData } from './black-hole/blackHoleStory.ts';
import {
	BRANCH_CHAPTER,
	CHAPTERS as BLACK_HOLE_CHAPTERS,
	chapterSlots as blackHoleSlots
} from './black-hole/chapters.ts';
import { branchGaugeText } from './black-hole/fallMath.ts';
import { CYGNUS_X1_HOLE } from './black-hole/holeData.ts';
import {
	branchGaugeTarget,
	branchTarget,
	findBlackHoleMismatches,
	gaugeTarget
} from './black-hole/storyChecks.ts';
import { parseStoryConfig } from './element-discovery/config.ts';
import { buildElements } from './element-discovery/elements.ts';
import { summarizeSteps } from './element-discovery/steps.ts';
import { findStoryMismatches } from './element-discovery/storyChecks.ts';
import { CHAPTER_ASIDES } from './light-age/asides.ts';
import { CHAPTERS, chapterSlots } from './light-age/chapters.ts';
import { storyYear } from './light-age/lightTime.ts';
import { buildEarthMoments, buildSkyObjects } from './light-age/skyData.ts';
import { findLightAgeMismatches, paragraph2Target } from './light-age/storyChecks.ts';
import { CHAPTER_ASIDES as SUNKEN_ASIDES } from './sunken-cities/asides.ts';
import {
	CHAPTERS as SUNKEN_CHAPTERS,
	chapterSlots as sunkenSlots
} from './sunken-cities/chapters.ts';
import {
	answerTarget,
	findSunkenMismatches,
	gaugeTarget as sunkenGaugeTarget
} from './sunken-cities/storyChecks.ts';
import { buildSunkenData } from './sunken-cities/sunkenData.ts';

const ELEMENT_DISCOVERY_STEP_COUNTS = [13, 14, 35, 48, 62, 64, 64, 75, 81, 81, 81, 89, 118];
const LIGHT_AGE_ASIDE_COUNT = 18;
const BLACK_HOLE_ASIDE_COUNT = 7;
const SUNKEN_ASIDE_COUNT = 4;

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

// static/data/stories/{story}.json 의 datasets[name].path 를 읽어 실제 발행 데이터 경로를 돌려준다(판 번호 하드코딩 금지).
function storyDatasetPath(storyFile: string, datasetName: string): string {
	const story = readJson(`../../../static/data/stories/${storyFile}`);
	assert.ok(isPublishedStory(story), storyFile);
	const reference = story.datasets[datasetName];
	assert.ok(reference !== undefined, `${storyFile}: dataset ${datasetName} not referenced`);
	return `../../../static${reference.path}`;
}

function readDataset(storyFile: string, datasetName: string): PublishedDataset {
	const raw = readJson(storyDatasetPath(storyFile, datasetName));
	assert.ok(isPublishedDataset(raw), `${storyFile}/${datasetName}`);
	return raw;
}

describe('1편 원소 발견사 — 구성-데이터 대조', () => {
	const namesRaw = readDataset('element-discovery.json', 'elements_ko');
	const discoveriesRaw = readDataset('element-discovery.json', 'element_discoveries');
	const config = parseStoryConfig(readJson('./element-discovery/element-discovery.config.json'));
	const images = parseStoryImages(readJson('./element-discovery/element-discovery.images.json'));

	test('불일치 0 · 13단계 count', () => {
		const elements = buildElements(namesRaw, discoveriesRaw);
		assert.ok(elements !== null);
		assert.deepEqual(findStoryMismatches(elements, config, images), []);
		const counts = summarizeSteps(elements, config.steps).map(
			(summary) => summary.knownNumbers.size
		);
		assert.deepEqual(counts, ELEMENT_DISCOVERY_STEP_COUNTS);
	});

	test('문구가 가리키는 연도가 데이터와 어긋나면 불일치', () => {
		// config "brand" 단계 checks: [[15, 1669]] — 15번 원소 발견 연도를 1670으로 바꿔 어긋나게 만든다.
		const shifted = clone(discoveriesRaw);
		const row = shifted.rows.find((candidate) => candidate.key === '15');
		assert.ok(row !== undefined);
		row.values.discovery_year = 1670;
		const elements = buildElements(namesRaw, shifted);
		assert.ok(elements !== null);
		const mismatches = findStoryMismatches(elements, config, images);
		assert.ok(mismatches.length >= 1, '데이터를 바꿨는데 불일치가 없음(false-green)');
	});
});

describe('2편 빛의 나이 — 문구-데이터 대조', () => {
	const objectsRaw = readDataset('light-age.json', 'sky_objects');
	const momentsRaw = readDataset('light-age.json', 'earth_moments');
	const images = parseStoryImages(readJson('./light-age/light-age.images.json'));
	const now = new Date();
	const year = storyYear(now);

	test('곁들임 18개 · 불일치 0', () => {
		assert.equal(CHAPTER_ASIDES.length, LIGHT_AGE_ASIDE_COUNT);
		const objects = buildSkyObjects(objectsRaw);
		const moments = buildEarthMoments(momentsRaw);
		assert.ok(objects !== null && moments !== null);
		const slots = chapterSlots(objects, now);
		assert.deepEqual(
			findLightAgeMismatches(CHAPTERS, CHAPTER_ASIDES, objects, moments, slots, images, year),
			[]
		);
	});

	test('문구가 가리키는 거리가 데이터와 어긋나면 불일치', () => {
		// aside "sun-eight-minutes": 태양 거리값을 바꿔 "8분"과 어긋나게 만든다.
		const shifted = clone(objectsRaw);
		const row = shifted.rows.find((candidate) => candidate.key === 'sun');
		assert.ok(row !== undefined);
		row.values.distance_value = 1;
		const objects = buildSkyObjects(shifted);
		const moments = buildEarthMoments(momentsRaw);
		assert.ok(objects !== null && moments !== null);
		const slots = chapterSlots(objects, now);
		const mismatches = findLightAgeMismatches(
			CHAPTERS,
			CHAPTER_ASIDES,
			objects,
			moments,
			slots,
			images,
			year
		);
		assert.ok(mismatches.length >= 1, '데이터를 바꿨는데 불일치가 없음(false-green)');
	});

	test('플레이아데스 거리가 어긋나 임진왜란 대조가 실패하면 13장 둘째 문단이 숨김 대상', () => {
		// aside "jomsaengi-bogi"/장 6 와 같은 사건(pleiades_imjin)을 13장 둘째 문단도 함께 쓴다.
		// pleiades 거리를 1년 전후로 바꿔 빛이 떠난 해를 1592년에서 멀어지게 한다(허용 범위 max(5%, 2년) 초과).
		const shifted = clone(objectsRaw);
		const row = shifted.rows.find((candidate) => candidate.key === 'pleiades');
		assert.ok(row !== undefined);
		row.values.distance_value = 1;
		row.values.distance_unit = '광년';
		const objects = buildSkyObjects(shifted);
		const moments = buildEarthMoments(momentsRaw);
		assert.ok(objects !== null && moments !== null);
		const slots = chapterSlots(objects, now);
		const mismatches = findLightAgeMismatches(
			CHAPTERS,
			CHAPTER_ASIDES,
			objects,
			moments,
			slots,
			images,
			year
		).map((mismatch) => mismatch.target);
		assert.ok(
			mismatches.includes(paragraph2Target('end')),
			'13장 둘째 문단(end/paragraph-2)이 숨김 대상에 없음'
		);
	});
});

describe('3편 사건의 지평선 너머 — 문구-데이터 대조', () => {
	const holesRaw = readDataset('black-hole.json', 'black_holes');
	const boundariesRaw = readDataset('black-hole.json', 'bh_boundaries');
	const images = parseStoryImages(readJson('./black-hole/black-hole.images.json'));

	function targets(holes: PublishedDataset, boundaries: PublishedDataset): string[] {
		const data = buildFallData(holes, boundaries);
		assert.ok(data !== null);
		return findBlackHoleMismatches(
			BLACK_HOLE_CHAPTERS,
			BLACK_HOLE_ASIDES,
			data,
			blackHoleSlots(data.holes),
			images,
			BRANCH_CHAPTER
		).map((mismatch) => mismatch.target);
	}

	function changed(
		dataset: PublishedDataset,
		key: string,
		field: string,
		value: number | boolean
	): PublishedDataset {
		const copy = clone(dataset);
		const row = copy.rows.find((candidate) => candidate.key === key);
		assert.ok(row !== undefined, key);
		row.values[field] = value;
		return copy;
	}

	test('곁들임 7개 · 불일치 0', () => {
		assert.equal(BLACK_HOLE_ASIDES.length, BLACK_HOLE_ASIDE_COUNT);
		assert.deepEqual(targets(holesRaw, boundariesRaw), []);
	});

	test('그림자가 실제 경계로 바뀌면 4장 문구가 숨김 대상', () => {
		const shifted = changed(boundariesRaw, 'shadow', 'physical', true);
		assert.ok(targets(holesRaw, shifted).includes('shadow'), '4장(shadow)이 숨김 대상에 없음');
	});

	test('안정 궤도가 그림자보다 안쪽이면 바깥에서 안으로 지나는 순서가 깨져 4장이 숨김 대상', () => {
		const shifted = changed(boundariesRaw, 'isco', 'radius_rs', 2);
		assert.ok(targets(holesRaw, shifted).includes('shadow'), '4장(shadow)이 숨김 대상에 없음');
	});

	test('지평선 반지름이 1배가 아니면 7장 문구가 숨김 대상', () => {
		const shifted = changed(boundariesRaw, 'horizon', 'radius_rs', 1.2);
		assert.ok(targets(holesRaw, shifted).includes('horizon'), '7장(horizon)이 숨김 대상에 없음');
	});

	test('백조자리 X-1 이 지평선에서 버틸 만큼 무거우면 9장 분기가 숨김 대상', () => {
		const shifted = changed(holesRaw, 'cyg_x1', 'mass_solar', 50_000);
		assert.ok(
			targets(shifted, boundariesRaw).includes(branchTarget(BRANCH_CHAPTER)),
			'9장 분기가 숨김 대상에 없음'
		);
	});

	test('9장 분기 계기판: 지평선 반지름 = 2.953 × 백조자리 X-1 질량(반올림 정수)', () => {
		const data = buildFallData(holesRaw, boundariesRaw);
		assert.ok(data !== null);
		const cygnus = data.holes.get(CYGNUS_X1_HOLE);
		assert.ok(cygnus !== undefined);
		const expectedKm = Math.round(2.953 * cygnus.massSolar);
		assert.equal(branchGaugeText(cygnus), `백조자리 X-1 · 지평선 반지름 약 ${expectedKm} km`);
	});

	test('백조자리 X-1 줄이 없으면 9장 분기 계기판이 숨김 대상', () => {
		const removed = clone(holesRaw);
		removed.rows = removed.rows.filter((row) => row.key !== CYGNUS_X1_HOLE);
		assert.ok(
			targets(removed, boundariesRaw).includes(branchGaugeTarget(BRANCH_CHAPTER)),
			'9장 분기 계기판이 숨김 대상에 없음'
		);
	});

	test('M87 질량 줄이 없으면 1장 문구 · 숫자 계기판 · 9장이 숨김 대상', () => {
		const removed = clone(holesRaw);
		removed.rows = removed.rows.filter((row) => row.key !== 'm87');
		const hidden = targets(removed, boundariesRaw);
		for (const target of ['far', gaugeTarget('isco'), gaugeTarget('horizon'), 'spaghetti']) {
			assert.ok(hidden.includes(target), `${target} 이 숨김 대상에 없음`);
		}
	});
});

describe('4편 바다 밑의 도시들 — 문구-데이터 대조', () => {
	const criteriaRaw = readDataset('sunken-cities.json', 'atlantis_criteria');
	const placesRaw = readDataset('sunken-cities.json', 'sunken_places');
	const measuresRaw = readDataset('sunken-cities.json', 'sunken_measures');
	const images = parseStoryImages(readJson('./sunken-cities/sunken-cities.images.json'));
	const year = storyYear(new Date());

	function targets(places: PublishedDataset, measures: PublishedDataset): string[] {
		const data = buildSunkenData(criteriaRaw, places, measures);
		assert.ok(data !== null);
		return findSunkenMismatches(
			SUNKEN_CHAPTERS,
			SUNKEN_ASIDES,
			data,
			sunkenSlots(data, year),
			images,
			year
		).map((mismatch) => mismatch.target);
	}

	function changed(key: string, field: string, value: string | number): PublishedDataset {
		const copy = clone(measuresRaw);
		const row = copy.rows.find((candidate) => candidate.key === key);
		assert.ok(row !== undefined, key);
		row.values[field] = value;
		return copy;
	}

	function removed(dataset: PublishedDataset, key: string): PublishedDataset {
		const copy = clone(dataset);
		copy.rows = copy.rows.filter((row) => row.key !== key);
		return copy;
	}

	function added(place: string, measure: string, yearFrom: number): PublishedDataset {
		const copy = clone(measuresRaw);
		copy.rows.push({
			key: `${place}|${measure}`,
			values: { place, measure, year_from: yearFrom, certainty: 'confirmed', note_ko: '시험용' },
			source: copy.rows[0].source
		});
		return copy;
	}

	/** 장 문단과 질문 목록 답이 함께 숨김 대상인지 */
	function assertChapterAndAnswerHidden(hidden: string[], chapterId: string): void {
		assert.ok(hidden.includes(chapterId), `${chapterId} 장이 숨김 대상에 없음`);
		assert.ok(hidden.includes(answerTarget(chapterId)), `${chapterId} 답이 숨김 대상에 없음`);
	}

	test('곁들임 4개 · 불일치 0(로컬 사본 atlantis_criteria v1 · sunken_places v1 · sunken_measures v2)', () => {
		assert.equal(SUNKEN_ASIDES.length, SUNKEN_ASIDE_COUNT);
		assert.deepEqual(targets(placesRaw, measuresRaw), []);
	});

	for (const [claim, key, chapterId] of [
		['lyonesse-discovered', 'lyonesse|discovered', 'lyonesse'],
		['doggerland-discovered', 'doggerland|discovered', 'doggerland'],
		['pavlopetri-discovered', 'pavlopetri|discovered', 'pavlopetri'],
		['heracleion-discovered', 'heracleion|discovered', 'heracleion'],
		['doggerland-depth', 'doggerland|depth', 'doggerland'],
		['pavlopetri-depth', 'pavlopetri|depth', 'pavlopetri'],
		['baiae-depth', 'baiae|depth', 'baiae'],
		['heracleion-depth', 'heracleion|depth', 'heracleion'],
		['doggerland-end', 'doggerland|submerge_end', 'doggerland'],
		['baiae-gradual(시작 줄)', 'baiae|submerge_start', 'baiae']
	] as const) {
		test(`${claim}: ${key} 줄이 없으면 장 · 답이 숨김 대상`, () => {
			assertChapterAndAnswerHidden(targets(placesRaw, removed(measuresRaw, key)), chapterId);
		});
	}

	test('baiae-gradual: 바이아이가 하루 만에 잠겼다면 5장 · 답이 숨김 대상', () => {
		assertChapterAndAnswerHidden(
			targets(placesRaw, changed('baiae|speed', 'verdict', 'match')),
			'baiae'
		);
	});

	test('pavlopetri-unknown-time: 파블로페트리에 잠긴 때 줄이 생기면 4장 · 답이 숨김 대상', () => {
		assertChapterAndAnswerHidden(
			targets(placesRaw, added('pavlopetri', 'submerge_end', -1000)),
			'pavlopetri'
		);
		assertChapterAndAnswerHidden(
			targets(placesRaw, added('pavlopetri', 'submerge_start', -1100)),
			'pavlopetri'
		);
	});

	test('port-royal-1692: 잠긴 해가 1692가 아니거나 하루 만이 아니면 7장 · 답이 숨김 대상', () => {
		assertChapterAndAnswerHidden(
			targets(placesRaw, changed('port_royal|submerge_end', 'year_from', 1693)),
			'port-royal'
		);
		assertChapterAndAnswerHidden(
			targets(placesRaw, changed('port_royal|speed', 'verdict', 'no')),
			'port-royal'
		);
	});

	test('도거랜드 수심이 없어도 3장 계기판은 그대로(계기판에 수심을 넣지 않음) · 바이아이 수심이 없으면 5장 계기판 숨김', () => {
		assert.ok(
			!targets(placesRaw, removed(measuresRaw, 'doggerland|depth')).includes(
				sunkenGaugeTarget('doggerland')
			),
			'3장 계기판이 숨김 대상'
		);
		assert.ok(
			targets(placesRaw, removed(measuresRaw, 'baiae|depth')).includes(sunkenGaugeTarget('baiae')),
			'5장 계기판이 숨김 대상에 없음'
		);
	});

	test('장소 줄이 없으면 그 장이 숨김 대상', () => {
		const hidden = targets(removed(placesRaw, 'pavlopetri'), measuresRaw);
		assert.ok(hidden.includes('pavlopetri'), '4장이 숨김 대상에 없음');
	});
});
