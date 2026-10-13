// 사라진 세 자리 시작 계산(순수 함수, DOM 없음, D-47 D9): 시제품 chaos-full.src.html :131-356 · :1336-1357 · :1968-1989 · :2352-2360 을
// 같은 상수 · 같은 연산 순서로 옮겼다(같은 결과). 그림은 진행값 p 만으로 정해지도록 이 결과를 읽기만 한다.
// 계산마다 함수 하나로 나눠, 실행 시점은 그리는 쪽이 정한다(STEP 144: 첫 화면 계산은 시작 동기, 무거운 셋은 유휴 시간 분할).
// 무거운 셋(빛 먼지 · 51줄기 · 세 천체)은 *Steps 생성기로도 둔다. 작은 단위마다 멈출 뿐 연산 순서는 같아 결과가 같다.

// ───────── 로렌츠 1963 모형: dx/dt = σ(y−x), dy/dt = x(ρ−z)−y, dz/dt = xy−βz ─────────
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;
/** RK4 고정 시간 간격(모형 시간) */
export const DT = 0.005;
// 출발점: (1,1,1)에서 5640걸음 미리 돌려 끌개 위에 올라선 상태. 그 뒤 한쪽 고리를 7바퀴 돌고 넘어가는 구간이 4-3 첫 문장과 맞는다
const PREROLL_START: Vec3 = [1, 1, 1];
const PREROLL_STEPS = 5640;
export const MAIN_STEPS = 10000;
// 4-4 · 표지 두 실: 기준 궤적 6240걸음 지점에서 두 점 출발. x 차이 0.000127(= 0.506127 − 0.506)
const PAIR_START_INDEX = 6240;
export const PAIR_DELTA_X = 0.000127;
export const PAIR_STEPS = 2450;
// 7-1 · 7-2: 기준 궤적 3000걸음 지점에서 51줄기. 1개는 그대로, 50개는 크기 1e-7 ~ 1e-2(로그 간격) · 방향은 시드 고정 난수
const ENSEMBLE_START_INDEX = 3000;
export const ENSEMBLE_PERTURBED = 50;
const ENSEMBLE_EPS_MIN = 1e-7;
const ENSEMBLE_EPS_MAX = 1e-2;
const ENSEMBLE_SEED = 20261013;
export const ENSEMBLE_STEPS = 4400;
// 4-3 빛 먼지: 끌개 바깥 넓은 공(중심 (0,0,25) · 반지름 DUST_RADIUS)에서 시드 고정 난수로 출발해 각자 같은 식으로 움직인다
export const DUST_COUNT = 400;
const DUST_SEED = 1963; // 임의 고정값
const DUST_RADIUS = 40;
const DUST_CENTER_Z = 25;
export const DUST_STEPS = 1000;
const DUST_SAMPLES = DUST_STEPS + 1;
// 공 안 균일 분포를 뽑을 때 너무 짧은 방향(정규화 불안정)은 다시 뽑는다
const DUST_MIN_DIRECTION = 1e-3;

export type Vec3 = [number, number, number];
type Series = Float32Array | Float64Array;

/** 내부 계산은 배정밀도로 하고, out 의 형식으로 저장한다. stride 걸음마다 한 번 저장한다(out 길이 = (steps / stride + 1) × 3) */
function integrateInto<T extends Series>(start: Vec3, steps: number, out: T, stride = 1): T {
	let x = start[0];
	let y = start[1];
	let z = start[2];
	out[0] = x;
	out[1] = y;
	out[2] = z;
	for (let i = 1; i <= steps; i++) {
		const k1x = SIGMA * (y - x),
			k1y = x * (RHO - z) - y,
			k1z = x * y - BETA * z;
		const ax = x + (k1x * DT) / 2,
			ay = y + (k1y * DT) / 2,
			az = z + (k1z * DT) / 2;
		const k2x = SIGMA * (ay - ax),
			k2y = ax * (RHO - az) - ay,
			k2z = ax * ay - BETA * az;
		const bx = x + (k2x * DT) / 2,
			by = y + (k2y * DT) / 2,
			bz = z + (k2z * DT) / 2;
		const k3x = SIGMA * (by - bx),
			k3y = bx * (RHO - bz) - by,
			k3z = bx * by - BETA * bz;
		const cx = x + k3x * DT,
			cy = y + k3y * DT,
			cz = z + k3z * DT;
		const k4x = SIGMA * (cy - cx),
			k4y = cx * (RHO - cz) - cy,
			k4z = cx * cy - BETA * cz;
		x = x + (DT / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
		y = y + (DT / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
		z = z + (DT / 6) * (k1z + 2 * k2z + 2 * k3z + k4z);
		if (i % stride === 0) {
			const offset = (i / stride) * 3;
			out[offset] = x;
			out[offset + 1] = y;
			out[offset + 2] = z;
		}
	}
	return out;
}

function integrate64(start: Vec3, steps: number): Float64Array {
	return integrateInto(start, steps, new Float64Array((steps + 1) * 3));
}

function integrate32(start: Vec3, steps: number): Float32Array {
	return integrateInto(start, steps, new Float32Array((steps + 1) * 3));
}

export function stateAt(series: Series, index: number): Vec3 {
	return [series[index * 3], series[index * 3 + 1], series[index * 3 + 2]];
}

/** 시드 고정 난수(0 이상 1 미만) */
export function mulberry32(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** 나눠 계산하는 생성기를 끝까지 돌려 결과를 받는다(유휴 시간에 다 못 했는데 그 장에 들어오면 남은 몫을 그 자리에서 마저 계산) */
export function finishSteps<T>(steps: Generator<void, T, void>): T {
	let result = steps.next();
	while (result.done !== true) result = steps.next();
	return result.value;
}

/** 기준 궤적(4-2 · 4-3 · 6-4 끌개, 다른 계산의 출발점): 과도 구간 뒤 MAIN_STEPS 걸음 */
export function computeMain(): Float64Array {
	const preroll = integrate64(PREROLL_START, PREROLL_STEPS);
	return integrate64(stateAt(preroll, PREROLL_STEPS), MAIN_STEPS);
}

/** 4-4 · 표지 두 실: x 만 0.000127 다르게 출발한 두 계산 */
export function computePair(main: Float64Array): [Float32Array, Float32Array] {
	const start = stateAt(main, PAIR_START_INDEX);
	return [
		integrate32(start, PAIR_STEPS),
		integrate32([start[0] + PAIR_DELTA_X, start[1], start[2]], PAIR_STEPS)
	];
}

export type Ensemble = {
	// 0번은 그대로, 1~50번은 출발점을 조금씩 바꾼 줄기
	members: Float32Array[];
	// 줄기마다 걸음별 0번 줄기와의 거리(색 결정용)
	distance: Float32Array[];
};

/** 7-1 · 7-2 51줄기. 줄기 하나를 계산할 때마다 멈춘다 */
export function* computeEnsembleSteps(main: Float64Array): Generator<void, Ensemble, void> {
	const base = stateAt(main, ENSEMBLE_START_INDEX);
	const members = [integrate32(base, ENSEMBLE_STEPS)];
	yield;
	const random = mulberry32(ENSEMBLE_SEED);
	for (let member = 0; member < ENSEMBLE_PERTURBED; member++) {
		const eps =
			ENSEMBLE_EPS_MIN *
			Math.pow(ENSEMBLE_EPS_MAX / ENSEMBLE_EPS_MIN, member / (ENSEMBLE_PERTURBED - 1));
		const direction = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
		const length = Math.hypot(...direction);
		const offset = direction.map((component) => (component / length) * eps);
		members.push(
			integrate32([base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]], ENSEMBLE_STEPS)
		);
		yield;
	}
	const reference = members[0];
	const distance = members.map((series) => {
		const result = new Float32Array(ENSEMBLE_STEPS + 1);
		for (let index = 0; index <= ENSEMBLE_STEPS; index++) {
			result[index] = Math.hypot(
				series[index * 3] - reference[index * 3],
				series[index * 3 + 1] - reference[index * 3 + 1],
				series[index * 3 + 2] - reference[index * 3 + 2]
			);
		}
		return result;
	});
	return { members, distance };
}

/** 7-1 · 7-2 51줄기(한 번에) */
export function computeEnsemble(main: Float64Array): Ensemble {
	return finishSteps(computeEnsembleSteps(main));
}

export type Dust = {
	// 알갱이마다 DUST_SAMPLES 표본(buffer 의 구간 보기)
	tracks: Float32Array[];
	buffer: Float32Array;
	// 알갱이마다 색 섞음(0~1)
	tint: Float32Array;
};

/** 4-3 빛 먼지: 모든 알갱이의 전 구간을 미리 계산해 둔다 → 진행값 p 만으로 배치가 정해진다(되감기 포함). 알갱이마다 멈춘다 */
export function* computeDustSteps(): Generator<void, Dust, void> {
	const buffer = new Float32Array(DUST_COUNT * DUST_SAMPLES * 3);
	const tracks: Float32Array[] = [];
	const tint = new Float32Array(DUST_COUNT);
	const random = mulberry32(DUST_SEED);
	for (let particle = 0; particle < DUST_COUNT; particle++) {
		// 공 안 균일 분포(반지름 ∝ 세제곱근)
		let direction: Vec3;
		do {
			direction = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
		} while (Math.hypot(...direction) > 1 || Math.hypot(...direction) < DUST_MIN_DIRECTION);
		const radius = (DUST_RADIUS * Math.cbrt(random())) / Math.hypot(...direction);
		const start: Vec3 = [
			direction[0] * radius,
			direction[1] * radius,
			DUST_CENTER_Z + direction[2] * radius
		];
		const view = buffer.subarray(particle * DUST_SAMPLES * 3, (particle + 1) * DUST_SAMPLES * 3);
		integrateInto(start, DUST_STEPS, view);
		tracks.push(view);
		tint[particle] = random();
		yield;
	}
	return { tracks, buffer, tint };
}

/** 4-3 빛 먼지(한 번에) */
export function computeDust(): Dust {
	return finishSteps(computeDustSteps());
}

// ───────── 두 날씨 시계열(2장 · 3장 · 5-4 · 표지) ─────────
// 기준 궤적의 WEATHER_START_INDEX 걸음에서 출발한 원래 날씨와, 그 40일째(다시 출발한 날 = 0일) 상태의 x 만 0.506/0.506127 배로 바꿔
// 다시 출발한 날씨. 하루 = WEATHER_STEPS_PER_DAY 걸음(모형 시간 0.28). |Δx|>1 이 처음 35.07일, 20일까지 |Δx| 최대 0.026
const WEATHER_START_INDEX = 175;
export const WEATHER_STEPS_PER_DAY = 56;
/** 다시 출발한 줄 앞의 원래 출력지 날 수(출력지 "중간쯤의 한 줄") */
export const WEATHER_DAYS_BEFORE = 40;
/** 다시 계산한 날 수(2-4 "예순 날") */
export const WEATHER_DAYS = 60;
// 날씨 계산이 쓰는 두 값(시뮬레이션 상수). 화면에 그리는 숫자 글자는 데이터에서 읽는다(chaosData screenFigures)
export const FULL_VALUE = 0.506127;
export const TRUNCATED_VALUE = 0.506;
const WEATHER_SPLIT_DISTANCE = 1;

export type Weather = {
	// 원래 날씨: −40~60일(WEATHER_DAYS_BEFORE + WEATHER_DAYS 일)
	base: Float64Array;
	// 다시 계산한 날씨: 0~60일
	copy: Float64Array;
	// 출력지 값 = x / printScale. 다시 출발한 줄의 값이 0.506127(찍힌 값 0.506)이 되도록 고른 눈금
	printScale: number;
	// 두 날씨가 처음 |Δx| > 1 로 벌어진 날(다시 출발한 날 = 0)
	splitDay: number;
};

export function computeWeather(main: Float64Array): Weather {
	const base = integrate64(
		stateAt(main, WEATHER_START_INDEX),
		(WEATHER_DAYS_BEFORE + WEATHER_DAYS) * WEATHER_STEPS_PER_DAY
	);
	const restart = stateAt(base, WEATHER_DAYS_BEFORE * WEATHER_STEPS_PER_DAY);
	const copy = integrate64(
		[(restart[0] * TRUNCATED_VALUE) / FULL_VALUE, restart[1], restart[2]],
		WEATHER_DAYS * WEATHER_STEPS_PER_DAY
	);
	return { base, copy, printScale: restart[0] / FULL_VALUE, splitDay: weatherSplitDay(base, copy) };
}

function weatherSplitDay(base: Float64Array, copy: Float64Array): number {
	for (let step = 0; step <= WEATHER_DAYS * WEATHER_STEPS_PER_DAY; step++) {
		const baseX = base[(WEATHER_DAYS_BEFORE * WEATHER_STEPS_PER_DAY + step) * 3];
		if (Math.abs(baseX - copy[step * 3]) > WEATHER_SPLIT_DISTANCE) {
			return step / WEATHER_STEPS_PER_DAY;
		}
	}
	return WEATHER_DAYS;
}

/** day(다시 출발한 날 = 0)의 x. 원래 날씨는 −40~60일, 다시 계산한 날씨는 0~60일. 걸음 사이는 직선 보간 */
export function weatherX(weather: Weather, which: 'base' | 'copy', day: number): number {
	const series = which === 'base' ? weather.base : weather.copy;
	const position = (day + (which === 'base' ? WEATHER_DAYS_BEFORE : 0)) * WEATHER_STEPS_PER_DAY;
	const last = series.length / 3 - 1;
	const index = Math.max(0, Math.min(last - 1, Math.floor(position)));
	const fraction = Math.max(0, Math.min(1, position - index));
	return series[index * 3] + (series[(index + 1) * 3] - series[index * 3]) * fraction;
}

// ───────── 3-3 하늘 대표값(:1968-1989) ─────────
// 3-3 하늘은 10일 단위 큰 흐름을 따른다: 0·10·…·60일 지점마다 ±5일 창의 맑음 평균을 대표값으로 둔다
// (그날 x 를 그대로 따르면 로렌츠의 2~3일 출렁임대로 하늘이 맑음↔비로 계속 뒤집힌다)
const SKY_ANCHOR_SPACING_DAYS = 10;
const SKY_ANCHOR_HALF_WINDOW_DAYS = 5;
// 하늘색 맑음 정도: 그날 x 가 클수록 맑다(x −8 → 0, 8 → 1)
const CLEARNESS_EDGES = [-8, 8] as const;

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

export function clearness(x: number): number {
	return smoothstep(CLEARNESS_EDGES[0], CLEARNESS_EDGES[1], x);
}

/** 0 · 10 · … · 60일 대표 맑음(7개). which 'base' = 위 언덕(0.506127 의 세계), 'copy' = 아래 언덕(0.506 의 세계) */
export function skyAnchors(weather: Weather, which: 'base' | 'copy'): number[] {
	const anchors: number[] = [];
	for (let center = 0; center <= WEATHER_DAYS; center += SKY_ANCHOR_SPACING_DAYS) {
		// 창을 0~60일로 먼저 자른다 — base 에만 있는 출발 전 구간이 0일 대표값에 섞이면 두 하늘이 처음부터 달라진다
		const firstStep = Math.max(0, center - SKY_ANCHOR_HALF_WINDOW_DAYS) * WEATHER_STEPS_PER_DAY;
		const lastStep =
			Math.min(WEATHER_DAYS, center + SKY_ANCHOR_HALF_WINDOW_DAYS) * WEATHER_STEPS_PER_DAY;
		let sum = 0;
		for (let step = firstStep; step <= lastStep; step++) {
			sum += clearness(weatherX(weather, which, step / WEATHER_STEPS_PER_DAY));
		}
		anchors.push(sum / (lastStep - firstStep + 1));
	}
	return anchors;
}

// ───────── 세 천체(5장) ─────────
// 질량 3 · 4 · 5 를 변 3 · 4 · 5 직각삼각형 꼭짓점에 정지 상태로 둔다(각 질량 = 마주 보는 변 길이).
// 질량 3 (1,3) · 질량 4 (−2,−1) · 질량 5 (1,−1). G = 1 · 연화 거리 0.01 · 고정 dt 속도 베를레 적분.
// 5-4 두 번째 계산은 질량 5 천체의 y 를 1e-6 바꾼다
const BODY_MASSES = [3, 4, 5];
const BODY_START = [1, 3, -2, -1, 1, -1];
const BODY_SOFTENING = 0.01;
const BODY_DT = 5e-5;
export const BODY_TIME = 52;
/** 저장 간격(모형 시간) */
export const BODY_SAMPLE_TIME = 0.01;
const BODY_NUDGE = 1e-6;
// 질량 5 천체의 y
const BODY_NUDGED_INDEX = 5;
// 두 계산의 같은 천체가 이만큼 벌어진 첫 순간 = 갈라짐
const BODY_SPLIT_DISTANCE = 0.3;
/** 그리기용 3차원 배열의 높이(투영 가운데와 같게 둬 깊이 효과가 없다) */
export const BODY_Z = 25;
const BODY_COUNT = 3;
// 5-3 펜이 멈춘 자리를 찾는 구간(모형 시간)
const BODY_STOP_FROM = 10;
const BODY_STOP_TO = 28;

// 나눠 계산할 때 이 걸음 수마다 멈춘다(계산 한 번에 104만 걸음)
const BODY_YIELD_STEPS = 10000;

/** 천체마다 [x, y, BODY_Z] 를 BODY_SAMPLE_TIME 마다 저장한 배열(궤적 그리기 함수를 그대로 쓰려고 3차원 형식) */
function* integrateBodies(start: number[]): Generator<void, Float32Array[], void> {
	const steps = Math.round(BODY_TIME / BODY_DT);
	const stride = Math.round(BODY_SAMPLE_TIME / BODY_DT);
	const samples = steps / stride + 1;
	const tracks = BODY_MASSES.map(() => new Float32Array(samples * 3));
	const position = Float64Array.from(start);
	const velocity = new Float64Array(BODY_COUNT * 2);
	const acceleration = new Float64Array(BODY_COUNT * 2);
	const softening2 = BODY_SOFTENING * BODY_SOFTENING;
	const accelerate = (): void => {
		acceleration.fill(0);
		for (let i = 0; i < BODY_COUNT; i++) {
			for (let j = i + 1; j < BODY_COUNT; j++) {
				const dx = position[j * 2] - position[i * 2],
					dy = position[j * 2 + 1] - position[i * 2 + 1];
				const r2 = dx * dx + dy * dy + softening2;
				const inverse = 1 / (r2 * Math.sqrt(r2));
				acceleration[i * 2] += BODY_MASSES[j] * dx * inverse;
				acceleration[i * 2 + 1] += BODY_MASSES[j] * dy * inverse;
				acceleration[j * 2] -= BODY_MASSES[i] * dx * inverse;
				acceleration[j * 2 + 1] -= BODY_MASSES[i] * dy * inverse;
			}
		}
	};
	const store = (sample: number): void => {
		for (let body = 0; body < BODY_COUNT; body++) {
			tracks[body][sample * 3] = position[body * 2];
			tracks[body][sample * 3 + 1] = position[body * 2 + 1];
			tracks[body][sample * 3 + 2] = BODY_Z;
		}
	};
	store(0);
	accelerate();
	for (let step = 1; step <= steps; step++) {
		for (let k = 0; k < BODY_COUNT * 2; k++) {
			velocity[k] += (acceleration[k] * BODY_DT) / 2;
			position[k] += velocity[k] * BODY_DT;
		}
		accelerate();
		for (let k = 0; k < BODY_COUNT * 2; k++) velocity[k] += (acceleration[k] * BODY_DT) / 2;
		if (step % stride === 0) store(step / stride);
		if (step % BODY_YIELD_STEPS === 0) yield;
	}
	return tracks;
}

export type BodySplit = { sample: number; body: number; time: number };

export type Bodies = {
	tracks: Float32Array[];
	nudged: Float32Array[];
	// 천체마다 표본 수
	samples: number;
	split: BodySplit;
	// 5-3 펜이 멈춘 자리: 질량 5 천체가 10~28 사이에서 가장 빠른 순간(가까이 스치는 곳)의 표본
	stopSample: number;
};

function bodySplit(tracks: Float32Array[], nudged: Float32Array[], samples: number): BodySplit {
	for (let sample = 0; sample < samples; sample++) {
		for (let body = 0; body < BODY_COUNT; body++) {
			const distance = Math.hypot(
				tracks[body][sample * 3] - nudged[body][sample * 3],
				tracks[body][sample * 3 + 1] - nudged[body][sample * 3 + 1]
			);
			if (distance > BODY_SPLIT_DISTANCE) return { sample, body, time: sample * BODY_SAMPLE_TIME };
		}
	}
	return { sample: samples - 1, body: 0, time: BODY_TIME };
}

function bodyStopSample(track: Float32Array): number {
	let best = 0;
	let bestSpeed = -1;
	const first = Math.round(BODY_STOP_FROM / BODY_SAMPLE_TIME);
	const last = Math.round(BODY_STOP_TO / BODY_SAMPLE_TIME);
	for (let sample = first; sample < last; sample++) {
		const speed = Math.hypot(
			track[(sample + 1) * 3] - track[sample * 3],
			track[(sample + 1) * 3 + 1] - track[sample * 3 + 1]
		);
		if (speed > bestSpeed) {
			bestSpeed = speed;
			best = sample;
		}
	}
	return best;
}

/** 5장 세 천체 두 계산. BODY_YIELD_STEPS 걸음마다 멈춘다 */
export function* computeBodiesSteps(): Generator<void, Bodies, void> {
	const tracks = yield* integrateBodies(BODY_START);
	const nudged = yield* integrateBodies(
		BODY_START.map((value, index) => (index === BODY_NUDGED_INDEX ? value + BODY_NUDGE : value))
	);
	const samples = tracks[0].length / 3;
	return {
		tracks,
		nudged,
		samples,
		split: bodySplit(tracks, nudged, samples),
		stopSample: bodyStopSample(tracks[2])
	};
}

/** 5장 세 천체(한 번에) */
export function computeBodies(): Bodies {
	return finishSteps(computeBodiesSteps());
}

// ───────── 표지 두 실 벌어짐(:1336-1357) ─────────
// 가로 = 걸음, 세로 = 두 계산 사이 거리의 로그(출발 거리 0 ~ 끌개 크기 1). 거리는 지수로 커지므로 로그로 보면 조금씩 벌어진다.
// 고리 한 바퀴 안의 들쭉날쭉(계단)이 보이지 않게 앞뒤 COVER_THREAD_WINDOW 걸음을 평균하고,
// 거리가 잠깐 줄어드는 걸음에서도 실이 다시 붙지 않게 지금까지의 최댓값을 쓴다
const COVER_THREAD_FAR = 30; // 이 거리(끌개 폭 정도)에서 벌어짐 최대
const COVER_THREAD_WINDOW = 120; // 걸음(반폭)

export function coverSpread(pair: [Float32Array, Float32Array]): Float32Array {
	const [first, second] = pair;
	const near = Math.log(PAIR_DELTA_X);
	const far = Math.log(COVER_THREAD_FAR);
	const prefix = new Float64Array(PAIR_STEPS + 2);
	for (let step = 0; step <= PAIR_STEPS; step++) {
		const distance = Math.hypot(
			first[step * 3] - second[step * 3],
			first[step * 3 + 1] - second[step * 3 + 1],
			first[step * 3 + 2] - second[step * 3 + 2]
		);
		prefix[step + 1] =
			prefix[step] + clamp01((Math.log(Math.max(distance, PAIR_DELTA_X)) - near) / (far - near));
	}
	const spread = new Float32Array(PAIR_STEPS + 1);
	let highest = 0;
	for (let step = 0; step <= PAIR_STEPS; step++) {
		const from = Math.max(0, step - COVER_THREAD_WINDOW);
		const to = Math.min(PAIR_STEPS, step + COVER_THREAD_WINDOW);
		highest = Math.max(highest, (prefix[to + 1] - prefix[from]) / (to - from + 1));
		spread[step] = highest;
	}
	// 한 점에서 출발하도록 첫 걸음 값을 0 으로 맞춘다
	const start = spread[0];
	for (let step = 0; step <= PAIR_STEPS; step++)
		spread[step] = (spread[step] - start) / (1 - start);
	return spread;
}
