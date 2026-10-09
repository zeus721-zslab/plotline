// 사건의 지평선 너머 계산 · 데이터 해석 · 장별 계기판 값 단위 테스트(node:test, 의존성 없음).
// 장별 계기판 값은 static/data 의 운영 확정 사본(black_holes v1 · bh_boundaries v1)으로 계산한다.
// 실행: docker compose exec frontend node --test src/lib/stories/black-hole/fallMath.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { isPublishedDataset, type PublishedDataset } from '../../story/published.ts';
import { buildFallData } from './blackHoleStory.ts';
import { CHAPTERS, chapterSlots } from './chapters.ts';
import {
	centerDistanceKm,
	gaugeReading,
	horizonRadiusKm,
	kmText,
	massEokText,
	outsideHourMinutes,
	stayTimeRatio
} from './fallMath.ts';
import { buildBoundaries, M87_HOLE } from './holeData.ts';
import { buildMapLayout } from './mapLayout.ts';

const M87_MASS = 6_500_000_000;

function readDataset(name: string): PublishedDataset {
	const raw: unknown = JSON.parse(
		readFileSync(
			new URL(`../../../../static/data/datasets/${name}/v1.json`, import.meta.url),
			'utf8'
		)
	);
	assert.ok(isPublishedDataset(raw), name);
	return raw;
}

describe('지평선 반지름 · 거리', () => {
	test('지평선 반지름 km = 2.953 × 태양 질량 배수', () => {
		assert.equal(horizonRadiusKm(1), 2.953);
		assert.equal(horizonRadiusKm(M87_MASS), 2.953 * M87_MASS);
	});

	test('중심까지 거리 = 지평선 반지름 × 경계 배수, km 표기는 앞 두 자리 한글 단위', () => {
		assert.equal(centerDistanceKm(M87_MASS, 3), 2.953 * M87_MASS * 3);
		assert.equal(kmText(horizonRadiusKm(M87_MASS)), '약 190억 km');
		assert.equal(kmText(centerDistanceKm(M87_MASS, 3)), '약 580억 km');
	});

	test('질량 억 단위 표기', () => {
		assert.equal(massEokText(M87_MASS), '65억');
		assert.equal(massEokText(6_540_000_000), '65억');
	});
});

describe('머문다면 시간 비율 √(1 − 1/r)', () => {
	test('경계 배수별 바깥 1시간 = N분(반올림)', () => {
		assert.equal(outsideHourMinutes(3), 49);
		assert.equal(outsideHourMinutes(2.5), 46);
		assert.equal(outsideHourMinutes(1.5), 35);
		assert.equal(outsideHourMinutes(1), 0);
	});

	test('지평선 안(r < 1)은 머물 수 없어 값이 없음', () => {
		assert.equal(stayTimeRatio(0.5), null);
		assert.equal(outsideHourMinutes(0.99), null);
		assert.equal(gaugeReading(M87_MASS, 0.5), null);
	});

	test('멀어질수록 1에 가까움', () => {
		const ratio = stayTimeRatio(1_000_000);
		assert.ok(ratio !== null && ratio > 0.999999);
	});
});

describe('장별 계기판 값 — static/data 운영 확정 사본 기준', () => {
	const data = buildFallData(readDataset('black_holes'), readDataset('bh_boundaries'));
	assert.ok(data !== null);
	const m87 = data.holes.get(M87_HOLE);
	assert.ok(m87 !== undefined);

	test('숫자 장 4곳(3 · 4 · 5 · 7장)', () => {
		const readings = CHAPTERS.flatMap((chapter) => {
			if (chapter.gauge.kind !== 'boundary') return [];
			const boundary = data.boundaries.get(chapter.gauge.boundary);
			assert.ok(boundary !== undefined && boundary.radiusRs !== null, chapter.id);
			return [[chapter.label, gaugeReading(m87.massSolar, boundary.radiusRs)]];
		});
		assert.deepEqual(readings, [
			['3장', { distance: '중심까지 약 580억 km', time: '여기 머문다면 바깥 1시간 = 49분' }],
			['4장', { distance: '중심까지 약 480억 km', time: '여기 머문다면 바깥 1시간 = 46분' }],
			['5장', { distance: '중심까지 약 290억 km', time: '여기 머문다면 바깥 1시간 = 35분' }],
			['7장', { distance: '중심까지 약 190억 km', time: '여기 머문다면 바깥 1시간 = 0분' }]
		]);
	});

	test('글로 표시하는 장(1 · 2 · 6 · 8~11장)', () => {
		const texts = CHAPTERS.flatMap((chapter) =>
			chapter.gauge.kind === 'text' ? [[chapter.label, chapter.gauge.text]] : []
		);
		assert.deepEqual(texts, [
			['1장', 'M87까지 아직 멀리 · 시간 차이 거의 없음'],
			['2장', 'M87까지 아직 멀리 · 시간 차이 거의 없음'],
			['6장', '작용권 · 회전 블랙홀에서만'],
			['8장', '지평선 안 · 머물 수 없음'],
			['9장', '지평선 안 · 머물 수 없음'],
			['10장', '지평선 안 · 머물 수 없음'],
			['11장', '지평선 안 · 머물 수 없음']
		]);
	});

	test('문구 자리: M87 질량 65억 · 백조자리 X-1 질량 21', () => {
		assert.deepEqual(chapterSlots(data.holes), { m87_mass: '65억', cyg_x1_mass: '21' });
	});

	test('단면 지도: 작용권은 지평선과 광자구 사이 표시용 띠, 나머지는 데이터 반지름', () => {
		const layout = buildMapLayout(data.boundaries);
		const radii = Object.fromEntries([...layout.values()].map((ring) => [ring.id, ring.radius]));
		assert.equal(radii.isco, 3);
		assert.equal(radii.shadow, 2.5);
		assert.equal(radii.photon_sphere, 1.5);
		assert.equal(radii.horizon, 1);
		assert.ok(radii.ergosphere > 1 && radii.ergosphere < 1.5, String(radii.ergosphere));
	});
});

describe('경계 데이터 해석', () => {
	const boundaries = readDataset('bh_boundaries');

	test('반지름이 없는 경계(작용권)는 null', () => {
		const built = buildBoundaries(boundaries);
		assert.ok(built !== null);
		const ergosphere = built.get('ergosphere');
		assert.ok(ergosphere !== undefined);
		assert.equal(ergosphere.radiusRs, null);
	});

	test('반지름이 0 이하면 형식 오류(null)', () => {
		const copy = JSON.parse(JSON.stringify(boundaries)) as PublishedDataset;
		const row = copy.rows.find((candidate) => candidate.key === 'horizon');
		assert.ok(row !== undefined);
		row.values.radius_rs = 0;
		assert.equal(buildBoundaries(copy), null);
	});
});
