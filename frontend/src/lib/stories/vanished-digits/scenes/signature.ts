// 시그니처 장면(시제품 :557-569 · :799-1067 그대로): A 4-2 · 4-3 · 4-4(끌개가 생기고, 빛 먼지가 끌려오고, 두 점이 갈라진다) ·
// B 6-4(같은 끌개를 보는 각도만 돌려 나비 모양) · C 7-1 · 7-2(51줄기). 51줄기 수는 데이터(ensembleMembers)를 따른다.
import { DUST_COUNT, DUST_STEPS, ENSEMBLE_STEPS } from '../chaosCompute.ts';
import {
	addTrail,
	applyBloom,
	AXIS,
	css,
	depthBright,
	depthWidth,
	drawHeadGlow,
	drawPairRipple,
	drawSprite,
	drawThread,
	fitScale,
	flushTrails,
	GOLD,
	headPoint,
	MAIN_GROUP,
	mainLook,
	makeView,
	nearness,
	projectX,
	projectY,
	pulse,
	rgba,
	S,
	screenX,
	screenY,
	setFrame,
	speedBright,
	WARM_GOLD_AT,
	WHITE,
	type SceneScales,
	type TrailLook,
	type View
} from '../chaosPaint.ts';
import {
	clamp01,
	KNOTS,
	lerp,
	piecewise,
	sceneAProgress,
	sceneCProgress,
	smootherstep,
	smoothstep,
	type Knots
} from '../chaosScene.ts';
import { beatAt } from '../chapters.ts';
import type { Series } from '../chaosWorld.ts';

// 시점(도 단위). A 는 비스듬히 위에서 내려다보며 p 로 천천히 돌고, 살아 있을 때만 시간으로 ±WOBBLE 흔들린다
export const VIEW_A_PATH = { yaw: [-2, 22], pitch: [58, 64] } as const;
const WOBBLE_DEGREES = 2.5;
const WOBBLE_PERIOD_S = 19;
export function viewAYaw(progress: number): number {
	return lerp(VIEW_A_PATH.yaw[0], VIEW_A_PATH.yaw[1], progress);
}
export function viewAPitch(progress: number): number {
	return lerp(VIEW_A_PATH.pitch[0], VIEW_A_PATH.pitch[1], progress);
}
const VIEW_B_START = { yaw: 58, pitch: 34 };
function viewBAmount(p: number): number {
	const from = beatAt('6-4', 0, 0.25);
	const to = beatAt('6-4', 1, 0.5);
	return smootherstep(clamp01((p - from) / (to - from)));
}
export function viewB(amount: number): View {
	return makeView(lerp(VIEW_B_START.yaw, 0, amount), lerp(VIEW_B_START.pitch, 0, amount));
}
// C: 그림 영역 비율(휴대폰 약 0.75 · PC 약 1.0)에 맞게 높이 내려다보는 시점. A 와 반대편(요 +180°)에서 본다
const VIEW_C_PATH = { yaw: [184, 196], pitch: 72 } as const;
function viewC(progress: number): View {
	return makeView(lerp(VIEW_C_PATH.yaw[0], VIEW_C_PATH.yaw[1], progress), VIEW_C_PATH.pitch);
}

const FIT_SAMPLES = 24;
function sampleViews(viewAt: (t: number) => View): View[] {
	return Array.from({ length: FIT_SAMPLES + 1 }, (_, sample) => viewAt(sample / FIT_SAMPLES));
}

/** 장면마다 시점 경로 전체에서 끌개가 들어가는 하나의 배율(회전 중 크기 고정). 캔버스 크기가 바뀔 때 다시 잰다 */
export function sceneScales(): SceneScales {
	const viewsA = [
		...sampleViews((t) => makeView(viewAYaw(t) - WOBBLE_DEGREES, viewAPitch(t))),
		...sampleViews((t) => makeView(viewAYaw(t) + WOBBLE_DEGREES, viewAPitch(t)))
	];
	return { A: fitScale(viewsA), B: fitScale(sampleViews(viewB)), C: fitScale(sampleViews(viewC)) };
}

function drawAxes(alpha: number, highlight: number[]): void {
	if (alpha <= 0) return;
	const context = S.context;
	// 원점(0,0,0)을 지나는 가로(x) · 세로(y) · 높이(z) 축
	const axes: [number, number, number][][] = [
		[
			[-24, 0, 0],
			[24, 0, 0]
		],
		[
			[0, -26, 0],
			[0, 26, 0]
		],
		[
			[0, 0, 0],
			[0, 0, 52]
		]
	];
	const toScreen = ([x, y, z]: [number, number, number]): [number, number] => [
		screenX(x, y),
		screenY(x, y, z)
	];
	axes.forEach(([from, to], index) => {
		const [x0, y0] = toScreen(from);
		const [x1, y1] = toScreen(to);
		const strength = alpha * (1 + 1.6 * highlight[index]);
		const gradient = context.createLinearGradient(x0, y0, x1, y1);
		gradient.addColorStop(0, rgba(AXIS, 0));
		gradient.addColorStop(index === 2 ? 0.02 : 0.5, rgba(AXIS, strength));
		gradient.addColorStop(1, rgba(AXIS, 0));
		context.strokeStyle = gradient;
		context.lineWidth = 1 * S.dpr;
		context.beginPath();
		context.moveTo(x0, y0);
		context.lineTo(x1, y1);
		context.stroke();
	});
}

/** 4-2 둘째 문장: 세 숫자를 차례로(돌기 세기 → 온도 차 → 고르지 않은 정도) 해당 축이 잠깐 밝아진다 */
function axisHighlight(p: number): number[] {
	const start = beatAt('4-2', 1, 0);
	const end = beatAt('4-2', 1, 1);
	const q = (p - start) / (end - start);
	return [0, 1, 2].map((index) =>
		q <= 0 || q >= 1 ? 0 : Math.max(0, Math.sin(clamp01(q * 3 - index) * Math.PI))
	);
}

// 효과 2: 빛 먼지(4-3 후반 ~ 4-4 첫머리). 진행값 → 걸음 → 미리 계산한 위치
const DUST_TAIL = 12; // 걸음
function drawDust(step: number, appear: number): void {
	if (appear <= 0) return;
	const dust = S.world.dust();
	for (let particle = 0; particle < DUST_COUNT; particle++) {
		const array = dust.tracks[particle];
		const warm = 0.12 + 0.4 * dust.tint[particle];
		addTrail(array, Math.max(0, step - DUST_TAIL), step, 3, (age, index) => {
			const fade = 1 - age / DUST_TAIL;
			if (fade <= 0) return null;
			const near = nearness(array, index);
			return {
				alpha: appear * 0.26 * fade * fade * depthBright(near) * speedBright(array, index),
				warm,
				width: 0.9 * depthWidth(near)
			};
		});
	}
	flushTrails();
	for (let particle = 0; particle < DUST_COUNT; particle++) {
		const array = dust.tracks[particle];
		const index = Math.min(DUST_STEPS, Math.round(step));
		const near = nearness(array, index);
		const [x, y] = headPoint(array, Math.min(DUST_STEPS, step));
		drawSprite('dust', x, y, lerp(5, 11, near), appear * lerp(0.25, 0.75, near));
	}
}

const PAIR_TAIL = 300;
export const PAIR_GROUP = 4;
/** 4-4 · 6-3 짝 계산 꼬리 */
export function pairLook(array: Series, warm: number, appear: number): TrailLook {
	return (age, index) => {
		if (age > PAIR_TAIL) return null;
		const fresh = 1 - age / PAIR_TAIL;
		const near = nearness(array, index);
		return {
			alpha: appear * 0.85 * fresh * fresh * depthBright(near) * speedBright(array, index),
			warm,
			width: (0.9 + 1.1 * fresh) * depthWidth(near)
		};
	};
}

/** 4-4 · 6-3: 짝 계산 두 점(금빛 · 흰빛) · 꼬리 · 빛 실 · 파문 */
export function drawPair(head: number, appear: number, knots: Knots, p: number): void {
	const [first, second] = S.world.pair;
	addTrail(
		first,
		Math.max(0, head - PAIR_TAIL),
		head,
		PAIR_GROUP,
		pairLook(first, WARM_GOLD_AT, appear)
	);
	addTrail(second, Math.max(0, head - PAIR_TAIL), head, PAIR_GROUP, pairLook(second, 0, appear));
	flushTrails();
	const goldPoint = headPoint(first, head);
	const whitePoint = headPoint(second, head);
	drawHeadGlow(first, head, 30, GOLD, appear);
	drawHeadGlow(second, head, 30, WHITE, appear);
	drawThread(head, appear, goldPoint, whitePoint);
	applyBloom(BLOOM_A);
	drawPairRipple(knots, p, appear);
	drawSprite('gold', goldPoint[0], goldPoint[1], 60, appear);
	drawSprite('white', whitePoint[0], whitePoint[1], 60, appear);
}

// ───────── 장면 A: 4-2 · 4-3 · 4-4 ─────────
const BLOOM_A = 1;
export function drawSceneA(beatId: string, p: number, seconds: number, alive: boolean): void {
	const main = S.world.main;
	const mainSteps = main.length / 3 - 1;
	const wobble = alive ? WOBBLE_DEGREES * Math.sin((seconds / WOBBLE_PERIOD_S) * Math.PI * 2) : 0;
	const progress = sceneAProgress(beatId, p);
	setFrame(makeView(viewAYaw(progress) + wobble, viewAPitch(progress)), S.scales.A);
	if (beatId === '4-2') {
		drawAxes(0.32 * smoothstep(beatAt('4-2', 0, 0.05), beatAt('4-2', 0, 0.8), p), axisHighlight(p));
		const head = piecewise(KNOTS.main42, p);
		const appear = smoothstep(beatAt('4-2', 2, 0.3), beatAt('4-2', 2, 0.6), p);
		addTrail(main, 0, head, MAIN_GROUP, mainLook(0.2, 0.95, 0, seconds));
		flushTrails();
		drawHeadGlow(main, head, 40, WHITE, appear);
		applyBloom(BLOOM_A);
		const [x, y] = headPoint(main, head);
		drawSprite('white', x, y, 64, appear * (alive ? 0.92 + 0.08 * Math.sin(seconds * 2.4) : 1));
		return;
	}
	if (beatId === '4-3') {
		drawAxes(lerp(0.32, 0.16, smoothstep(0, 0.6, p)), [0, 0, 0]);
		const head = piecewise(KNOTS.main43, p);
		const complete = smoothstep(beatAt('4-3', 5, 0.5), beatAt('4-3', 5, 0.75), p);
		addTrail(
			main,
			0,
			head,
			MAIN_GROUP,
			mainLook(0.16, lerp(0.95, 0.4, complete), alive ? 0.22 * complete : 0, seconds)
		);
		flushTrails();
		drawHeadGlow(main, head, 40, WHITE, 1 - 0.85 * complete);
		drawDust(
			piecewise(KNOTS.dust43, p),
			smoothstep(beatAt('4-3', 3, 0.45), beatAt('4-3', 3, 0.85), p)
		);
		applyBloom(BLOOM_A);
		const [x, y] = headPoint(main, head);
		drawSprite('white', x, y, 64, 1 - 0.85 * complete);
		return;
	}
	// 4-4: 완성된 모양을 옅게 남기고 그 위에 두 점
	const ghost = smoothstep(0, beatAt('4-4', 0, 0.35), p);
	drawAxes(lerp(0.16, 0.06, ghost), [0, 0, 0]);
	addTrail(
		main,
		0,
		mainSteps,
		MAIN_GROUP,
		mainLook(lerp(0.16, 0.07, ghost), lerp(0.95, 0.07, ghost), 0, seconds)
	);
	flushTrails();
	drawDust(piecewise(KNOTS.dust44, p), 1 - smoothstep(0, beatAt('4-4', 0, 0.5), p));
	const appear = smoothstep(beatAt('4-4', 0, 0.15), beatAt('4-4', 0, 0.45), p);
	if (appear <= 0) {
		applyBloom(BLOOM_A);
		return;
	}
	drawPair(piecewise(KNOTS.pair44, p), appear, KNOTS.pair44, p);
}

// ───────── 장면 B: 6-4. 같은 기준 궤적 그대로, 보는 각도만 돌아간다(시간 흔들림 없음). 깊이 음영만 더한다 ─────────
export function drawSceneB(p: number, seconds: number, alive: boolean): void {
	const main = S.world.main;
	const mainSteps = main.length / 3 - 1;
	setFrame(viewB(viewBAmount(p)), S.scales.B);
	const on = smoothstep(0, beatAt('6-4', 0, 0.3), p);
	addTrail(main, 0, mainSteps, MAIN_GROUP, (_age, index) => {
		const near = nearness(main, index);
		return {
			alpha: on * (0.2 + (alive ? 0.2 * pulse(index, mainSteps, seconds) : 0)) * depthBright(near),
			warm: WARM_GOLD_AT * 0.75,
			width: 1.05 * depthWidth(near)
		};
	});
	flushTrails();
}

// ───────── 장면 C: 7-1 · 7-2. 51줄기 ─────────
const ENSEMBLE_TAIL = 520;
const ENSEMBLE_GROUP = 8;
// 효과 5: 기준 줄기와의 거리(모형 단위) → 따뜻함. 가까우면 흰빛, 멀어질수록 금 → 주황
const ENSEMBLE_WARM_DISTANCE = [0.3, 14] as const;
function ensembleWarm(distance: number): number {
	return smoothstep(ENSEMBLE_WARM_DISTANCE[0], ENSEMBLE_WARM_DISTANCE[1], distance);
}
// 효과 5 시간 눈금: 일정 걸음(모형 시간 0.3)마다 옅은 점 하나. 51줄기 다발의 바깥 가장자리 너머에 둔다. 숫자 없음
const TICK_STEPS = 60;
const TICK_GAP_CSS = 7;
const TICK_EDGE_MAX_CSS = 26;
const TICK_RADIUS_CSS = 1.2;
const TICK_CURVE_STEPS = 8; // 휘어짐(바깥쪽) 판정 간격
const TICK_COLOR = [226, 220, 206] as const;

function drawTicks(members: Float32Array[], head: number, appear: number): void {
	if (appear <= 0) return;
	const context = S.context;
	const reference = members[0];
	const first = Math.max(TICK_STEPS, Math.ceil((head - ENSEMBLE_TAIL) / TICK_STEPS) * TICK_STEPS);
	for (
		let index = first;
		index <= head && index + TICK_CURVE_STEPS <= ENSEMBLE_STEPS;
		index += TICK_STEPS
	) {
		const fade = 1 - (head - index) / ENSEMBLE_TAIL;
		const x = projectX(reference, index);
		const y = projectY(reference, index);
		const tangentX = projectX(reference, index + 1) - projectX(reference, index - 1);
		const tangentY = projectY(reference, index + 1) - projectY(reference, index - 1);
		const length = Math.hypot(tangentX, tangentY) || 1;
		let normalX = -tangentY / length;
		let normalY = tangentX / length;
		// 굽은 안쪽(두 번째 차분 방향)의 반대가 바깥
		const bendX =
			projectX(reference, index + TICK_CURVE_STEPS) +
			projectX(reference, index - TICK_CURVE_STEPS) -
			2 * x;
		const bendY =
			projectY(reference, index + TICK_CURVE_STEPS) +
			projectY(reference, index - TICK_CURVE_STEPS) -
			2 * y;
		if (normalX * bendX + normalY * bendY > 0) {
			normalX = -normalX;
			normalY = -normalY;
		}
		let edge = 0;
		for (let member = 1; member < members.length; member++) {
			edge = Math.max(
				edge,
				(projectX(members[member], index) - x) * normalX +
					(projectY(members[member], index) - y) * normalY
			);
		}
		// 다발이 꽃처럼 다 풀린 뒤에는 가장자리가 화면 전체라 눈금이 날아가지 않게 상한을 둔다
		const offset = Math.min(edge, css(TICK_EDGE_MAX_CSS)) + css(TICK_GAP_CSS);
		context.fillStyle = rgba(TICK_COLOR, appear * 0.4 * fade);
		context.beginPath();
		context.arc(x + normalX * offset, y + normalY * offset, css(TICK_RADIUS_CSS), 0, Math.PI * 2);
		context.fill();
	}
}

const BLOOM_C = 0.8;
export function drawSceneC(beatId: string, p: number): void {
	// 줄기 수는 데이터(ensembleMembers)를 따른다. 대조가 어긋나면 줄기를 그리지 않는다
	const count = S.figures.ensembleMembers;
	if (count === null) return;
	setFrame(viewC(sceneCProgress(beatId, p)), S.scales.C);
	const appear = beatId === '7-1' ? smoothstep(beatAt('7-1', 2, 0.2), beatAt('7-1', 2, 0.6), p) : 1;
	if (appear <= 0) return;
	const ensemble = S.world.ensemble();
	const members = ensemble.members.slice(0, count);
	const head = beatId === '7-1' ? piecewise(KNOTS.ens71, p) : piecewise(KNOTS.ens72, p);
	members.forEach((array, member) => {
		const distance = ensemble.distance[member];
		const weight = member === 0 ? 1.6 : 1;
		addTrail(array, Math.max(0, head - ENSEMBLE_TAIL), head, ENSEMBLE_GROUP, (age, index) => {
			if (age > ENSEMBLE_TAIL) return null;
			const fresh = 1 - age / ENSEMBLE_TAIL;
			const near = nearness(array, index);
			return {
				alpha:
					appear *
					(0.03 + 0.3 * fresh * fresh) *
					weight *
					depthBright(near) *
					speedBright(array, index),
				warm: member === 0 ? 0 : ensembleWarm(distance[index]),
				width: (0.8 + 0.7 * fresh) * depthWidth(near)
			};
		});
	});
	flushTrails();
	if (beatId === '7-2') drawTicks(members, head, smoothstep(0, beatAt('7-2', 0, 0.4), p));
	applyBloom(BLOOM_C);
	const headIndex = Math.min(ENSEMBLE_STEPS, Math.round(head));
	members.forEach((array, member) => {
		const [x, y] = headPoint(array, head);
		const near = nearness(array, headIndex);
		drawSprite(
			'ensemble',
			x,
			y,
			(member === 0 ? 40 : 22) * lerp(0.75, 1.2, near),
			appear * (member === 0 ? 0.95 : 0.4) * lerp(0.6, 1, near)
		);
	});
}
