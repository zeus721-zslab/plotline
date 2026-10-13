// 사라진 세 자리 계산 결과 묶음(D-47 D9 · STEP 144 확정): 첫 화면(표지 · 1~3장)에 필요한 계산은 만들 때 동기로 하고,
// 무거운 셋(빛 먼지 4장 · 세 천체×2 5장 · 51줄기 7장)은 유휴 시간에 나눠 미리 계산한다(requestIdleCallback, 없으면 setTimeout 분할).
// 유휴 계산이 끝나기 전에 그 장에 들어오면 남은 몫을 그 자리에서 마저 계산한다(get 이 끝까지 돌림). 결과는 같은 계산이라 같다.
import {
	computeBodiesSteps,
	computeDustSteps,
	computeEnsembleSteps,
	computeMain,
	computePair,
	computeWeather,
	coverSpread,
	finishSteps,
	skyAnchors,
	type Bodies,
	type Dust,
	type Ensemble,
	type Weather
} from './chaosCompute.ts';
import { sky33Knots, type SkyKnots } from './chaosScene.ts';

export type Series = Float32Array | Float64Array;

/** 미리 계산하는 무거운 셋(장 순서) */
export const PREWARM_ORDER = ['dust', 'bodies', 'ensemble'] as const;
export type PrewarmName = (typeof PREWARM_ORDER)[number];

export type ChaosWorld = {
	main: Float64Array;
	pair: [Float32Array, Float32Array];
	weather: Weather;
	sky: SkyKnots;
	coverSpread: Float32Array;
	dust: () => Dust;
	bodies: () => Bodies;
	ensemble: () => Ensemble;
	/** 유휴 시간 미리 계산을 시작한다. 하나 끝날 때마다 ondone. 돌려준 함수로 멈춘다 */
	prewarm: (ondone: (name: PrewarmName) => void) => () => void;
};

/** 나눠 계산하는 일 하나: 끝까지 돌린 결과를 기억한다 */
type Job<T> = { step: () => boolean; get: () => T };

function job<T>(start: () => Generator<void, T, void>): Job<T> {
	let steps: Generator<void, T, void> | null = null;
	let result: T | null = null;
	return {
		// 한 단위만 계산한다. 끝났으면 true
		step: () => {
			if (result !== null) return true;
			if (steps === null) steps = start();
			const next = steps.next();
			if (next.done === true) result = next.value;
			return result !== null;
		},
		get: () => {
			if (result === null) result = finishSteps(steps === null ? start() : steps);
			return result;
		}
	};
}

// 유휴 콜백이 없을 때 setTimeout 한 번에 쓰는 시간(ms) · 유휴 콜백에서 남겨 둘 시간(ms)
const TIMEOUT_SLICE_MS = 8;
const IDLE_RESERVE_MS = 2;

/** 남은 시간 동안 일을 나눠 돌리는 예약기(requestIdleCallback, 없으면 setTimeout) */
function scheduleSlices(work: (hasTime: () => boolean) => boolean): () => void {
	let handle = 0;
	let stopped = false;
	const idle = typeof window.requestIdleCallback === 'function';
	const run = (hasTime: () => boolean): void => {
		if (stopped) return;
		if (work(hasTime)) return;
		queue();
	};
	const queue = (): void => {
		if (idle) {
			handle = window.requestIdleCallback((deadline) =>
				run(() => deadline.timeRemaining() > IDLE_RESERVE_MS)
			);
		} else {
			handle = window.setTimeout(() => {
				const until = performance.now() + TIMEOUT_SLICE_MS;
				run(() => performance.now() < until);
			}, 0);
		}
	};
	queue();
	return () => {
		stopped = true;
		if (idle) window.cancelIdleCallback(handle);
		else window.clearTimeout(handle);
	};
}

export function createWorld(): ChaosWorld {
	// 첫 화면 계산(동기): 기준 궤적 · 짝 계산 · 두 날씨 · 3-3 하늘 대표값 · 표지 두 실
	const main = computeMain();
	const pair = computePair(main);
	const weather = computeWeather(main);
	const sky = {
		top: sky33Knots(skyAnchors(weather, 'base')),
		bottom: sky33Knots(skyAnchors(weather, 'copy'))
	};
	const jobs = {
		dust: job(() => computeDustSteps()),
		bodies: job(() => computeBodiesSteps()),
		ensemble: job(() => computeEnsembleSteps(main))
	};
	return {
		main,
		pair,
		weather,
		sky,
		coverSpread: coverSpread(pair),
		dust: () => jobs.dust.get(),
		bodies: () => jobs.bodies.get(),
		ensemble: () => jobs.ensemble.get(),
		prewarm: (ondone) => {
			let current = 0;
			return scheduleSlices((hasTime) => {
				while (current < PREWARM_ORDER.length) {
					const name = PREWARM_ORDER[current];
					if (jobs[name].step()) {
						ondone(name);
						current += 1;
						continue;
					}
					if (!hasTime()) return false;
				}
				return true;
			});
		}
	};
}
