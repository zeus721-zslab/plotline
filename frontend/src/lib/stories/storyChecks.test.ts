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

const ELEMENT_DISCOVERY_STEP_COUNTS = [13, 14, 35, 48, 62, 64, 64, 75, 81, 81, 81, 89, 118];
const LIGHT_AGE_ASIDE_COUNT = 18;
const BLACK_HOLE_ASIDE_COUNT = 7;

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
