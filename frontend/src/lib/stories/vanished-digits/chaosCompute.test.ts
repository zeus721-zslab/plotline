// 사라진 세 자리 시작 계산(chaosCompute) 테스트(node:test). 시제품 확정값(STEP 135~141 검증 수치)과 맞는지 단언한다.
// 허용 오차는 시제품 계산을 Node 에서 다시 돌린 값(STEP 143, 이식본과 배열 전체가 비트 단위로 같음) 기준으로, 확정값의 표기 자릿수 안에 둔다.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	BODY_SAMPLE_TIME,
	computeBodies,
	computeDust,
	computeEnsemble,
	computeMain,
	computePair,
	computeWeather,
	coverSpread,
	DUST_COUNT,
	DUST_STEPS,
	ENSEMBLE_PERTURBED,
	ENSEMBLE_STEPS,
	FULL_VALUE,
	MAIN_STEPS,
	PAIR_DELTA_X,
	PAIR_STEPS,
	skyAnchors,
	WEATHER_DAYS,
	WEATHER_DAYS_BEFORE,
	WEATHER_STEPS_PER_DAY,
	weatherX
} from './chaosCompute.ts';

function assertNear(actual: number, expected: number, tolerance: number, label: string): void {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`${label}: ${actual} (기대 ${expected} ± ${tolerance})`
	);
}

const main = computeMain();
const weather = computeWeather(main);

describe('기준 궤적 · 두 실 · 51줄기 · 빛 먼지', () => {
	test('기준 궤적은 MAIN_STEPS + 1 표본', () => {
		assert.equal(main.length, (MAIN_STEPS + 1) * 3);
	});

	test('두 실은 x 만 0.000127 다르게 같은 자리에서 출발', () => {
		const [first, second] = computePair(main);
		assert.equal(first.length, (PAIR_STEPS + 1) * 3);
		assertNear(second[0] - first[0], PAIR_DELTA_X, 1e-5, 'Δx');
		assert.equal(second[1], first[1]);
		assert.equal(second[2], first[2]);
	});

	test('표지 두 실 벌어짐은 0 에서 출발해 줄지 않고 1 을 넘지 않는다(대표 걸음은 시제품 실행값)', () => {
		const spread = coverSpread(computePair(main));
		assert.equal(spread[0], 0);
		for (const [step, expected] of [
			[600, 0.2199],
			[1225, 0.5223],
			[1800, 0.9713],
			[PAIR_STEPS, 0.985]
		]) {
			assertNear(spread[step], expected, 1e-4, `${step} 걸음`);
		}
		for (let step = 1; step < spread.length; step++) {
			assert.ok(spread[step] >= spread[step - 1], `${step} 걸음에서 줄었다`);
		}
		assert.ok(spread[spread.length - 1] <= 1);
	});

	test('51줄기(1 + 50), 가장 크게 흔든 줄기는 출발 때 0번 줄기와 1e-2 떨어짐', () => {
		const ensemble = computeEnsemble(main);
		assert.equal(ensemble.members.length, 1 + ENSEMBLE_PERTURBED);
		assert.equal(ensemble.distance.length, 1 + ENSEMBLE_PERTURBED);
		assert.equal(ensemble.members[0].length, (ENSEMBLE_STEPS + 1) * 3);
		for (const distance of ensemble.distance) assert.ok(distance[0] <= 1e-2 * 1.0001);
		assertNear(ensemble.distance[ENSEMBLE_PERTURBED][0], 1e-2, 1e-5, '50번 줄기 출발 거리');
	});

	test('빛 먼지 400알, 알갱이마다 DUST_STEPS + 1 표본', () => {
		const dust = computeDust();
		assert.equal(dust.tracks.length, DUST_COUNT);
		assert.equal(dust.tracks[0].length, (DUST_STEPS + 1) * 3);
		assert.equal(dust.tint.length, DUST_COUNT);
	});
});

describe('두 날씨 시계열(시제품 확정값)', () => {
	test('다시 출발한 줄의 출력지 값은 0.506127', () => {
		const restartX = weather.base[WEATHER_DAYS_BEFORE * WEATHER_STEPS_PER_DAY * 3];
		assertNear(restartX / weather.printScale, FULL_VALUE, 1e-12, '출력지 값');
		assertNear(weather.copy[0] / weather.printScale, 0.506, 1e-12, '다시 계산 0일 값');
	});

	test('두 날씨가 |Δx| > 1 로 갈라진 날 35.07일', () => {
		assertNear(weather.splitDay, 35.07, 0.005, '갈라진 날');
	});

	test('20일까지 |Δx| 최대 0.026', () => {
		let maximum = 0;
		for (let step = 0; step <= 20 * WEATHER_STEPS_PER_DAY; step++) {
			const baseX = weather.base[(WEATHER_DAYS_BEFORE * WEATHER_STEPS_PER_DAY + step) * 3];
			maximum = Math.max(maximum, Math.abs(baseX - weather.copy[step * 3]));
		}
		assertNear(maximum, 0.026, 0.0005, '20일까지 최대 차이');
	});

	test('60일째 x: 원래 15.38 · 다시 계산 −11.72', () => {
		assertNear(weatherX(weather, 'base', WEATHER_DAYS), 15.38, 0.005, '원래 60일');
		assertNear(weatherX(weather, 'copy', WEATHER_DAYS), -11.72, 0.005, '다시 계산 60일');
	});
});

describe('3-3 하늘 대표값(SKY_ANCHORS, ±0.002)', () => {
	const TOLERANCE = 0.002;

	test('위 언덕(0.506127 의 세계)', () => {
		const expected = [0.447, 0.312, 0.82, 0.226, 0.508, 0.508, 0.87];
		const anchors = skyAnchors(weather, 'base');
		assert.equal(anchors.length, expected.length);
		anchors.forEach((anchor, index) =>
			assertNear(anchor, expected[index], TOLERANCE, `위 ${index * 10}일`)
		);
	});

	test('아래 언덕(0.506 의 세계)', () => {
		const expected = [0.447, 0.312, 0.819, 0.222, 0.551, 0.884, 0.184];
		const anchors = skyAnchors(weather, 'copy');
		assert.equal(anchors.length, expected.length);
		anchors.forEach((anchor, index) =>
			assertNear(anchor, expected[index], TOLERANCE, `아래 ${index * 10}일`)
		);
	});
});

describe('세 천체(시제품 확정값)', () => {
	const bodies = computeBodies();

	test('질량 5 천체 y 를 1e-6 바꾼 두 계산이 0.3 벌어진 첫 순간 t = 46.34', () => {
		assertNear(bodies.split.time, 46.34, BODY_SAMPLE_TIME / 2, '갈라짐 시각');
		assert.equal(bodies.split.sample, 4634);
	});

	test('5-3 펜이 멈춘 자리: 질량 5 천체가 10~28 사이에서 가장 빠른 표본(시제품 실행값 1331)', () => {
		assert.equal(bodies.stopSample, 1331);
	});
});
