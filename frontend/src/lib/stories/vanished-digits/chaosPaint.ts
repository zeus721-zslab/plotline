// 사라진 세 자리 그리기 바탕(시제품 chaos-full.src.html :357-375 · :571-907 · :1069-1169 그대로): 색 · 투영 · 빛 머리(스프라이트) ·
// 빛 번짐(bloom) · 궤적 꼬리 · 파문 · 빛 실 · 글자, 그리고 연도 굴림(오도미터) 자리 계산.
// 그리기 상태(캔버스 · 크기 · 배율 · 계산 결과 · 화면 숫자)는 이 모듈의 S 하나에 둔다(7편 linePaint.ts 와 같은 방식). 렌더러가 프레임마다 채운다.
import type { Series } from './chaosWorld.ts';
import type { ChaosWorld } from './chaosWorld.ts';
import { clamp01, inversePiecewise, lerp, smoothstep, type Knots } from './chaosScene.ts';

// ───────── 색 ─────────
export type Rgb = readonly [number, number, number];
export const GOLD: Rgb = [240, 190, 105];
export const WHITE: Rgb = [255, 248, 236];
const ORANGE: Rgb = [242, 132, 64];
export const AXIS: Rgb = [214, 210, 200];
/** 따뜻함 0(흰빛) → 0.6(금빛) → 1(주황) */
export const WARM_GOLD_AT = 0.6;

export const FONT_SANS =
	'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
export const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const FONT_SERIF = 'Georgia, "Times New Roman", serif';

// ───────── 로렌츠 식(속도 효과용, chaosCompute 와 같은 상수) ─────────
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;

// 효과 1 깊이: 가까움 w 를 ±DEPTH_RANGE 로 0~1 정규화 → 밝기 · 굵기 배율
const DEPTH_RANGE = 24;
const DEPTH_BRIGHT = [0.3, 1.15] as const;
const DEPTH_WIDTH = [0.5, 1.6] as const;
// 효과 3 속도: |dX/dt| 를 SPEED_RANGE 에서 0~1 로 → 밝기 배율 · 색 온도(빠를수록 흰빛)
const SPEED_RANGE = [30, 200] as const;
export const SPEED_BRIGHT = [0.5, 1.35] as const;
const SPEED_COOL = 0.3;
/** 끌개 높이 범위(약 0~50)의 가운데. x · y 중심은 0 */
export const CENTER_Z = 25;

/** 화면 숫자(데이터에서 읽음). null 이면 문구 대조가 어긋나 그 숫자 · 그림을 그리지 않는다 */
export type SceneFigures = {
	fullValueText: string | null;
	printedValueText: string | null;
	calendar: { reliableDays: number; limitDays: number } | null;
	ensembleMembers: number | null;
	barShortMm: number | null;
};

/** 표지 · 끝 화면 빛점 자리(기기 px). stillX 는 정지 그림에서 실이 나오는 자리 */
export type MarkPoint = { x: number; y: number; stillX: number };
/** 3-1 큰 숫자: 가운데 높이 · 떨어지는 자리들의 가운데 x · 떨어지는 거리(기기 px) */
export type BigNumberPoint = { centerY: number; digitX: number[]; fallPx: number };

export type View = {
	ux: number;
	uy: number;
	vx: number;
	vy: number;
	vz: number;
	wx: number;
	wy: number;
	wz: number;
};
type Frame = {
	view: View;
	scale: number;
	cx: number;
	cy: number;
	offsetU: number;
	offsetV: number;
};
export type SceneScales = { A: number; B: number; C: number };

type PaintState = {
	context: CanvasRenderingContext2D;
	width: number;
	height: number;
	dpr: number;
	// 암전 구간에서만 1보다 작아지는 전체 투명도(앞 장면의 마지막 그림이 꺼져 간다)
	alphaScale: number;
	frame: Frame;
	scales: SceneScales;
	world: ChaosWorld;
	figures: SceneFigures;
	markPoint: () => MarkPoint;
	bigNumberPoint: () => BigNumberPoint | null;
};

const IDENTITY_VIEW: View = { ux: 1, uy: 0, vx: 0, vy: 0, vz: 1, wx: 0, wy: -1, wz: 0 };

/** 그리기 상태. 렌더러가 만들 때 setPaintState 로 채운다 */
export let S: PaintState;

export function setPaintState(state: Omit<PaintState, 'alphaScale' | 'frame'>): void {
	S = {
		...state,
		alphaScale: 1,
		frame: { view: IDENTITY_VIEW, scale: 1, cx: 0, cy: 0, offsetU: 0, offsetV: 0 }
	};
}

export function mix(colorA: Rgb, colorB: Rgb, t: number): Rgb {
	return [
		lerp(colorA[0], colorB[0], t),
		lerp(colorA[1], colorB[1], t),
		lerp(colorA[2], colorB[2], t)
	];
}

export function warmColor(warm: number): Rgb {
	return warm <= WARM_GOLD_AT
		? mix(WHITE, GOLD, warm / WARM_GOLD_AT)
		: mix(GOLD, ORANGE, (warm - WARM_GOLD_AT) / (1 - WARM_GOLD_AT));
}

function rgbaRaw(color: Rgb, alpha: number): string {
	return `rgba(${color[0] | 0},${color[1] | 0},${color[2] | 0},${Math.min(1, Math.max(0, alpha)).toFixed(4)})`;
}

/** 지금 전체 투명도(alphaScale)를 곱한 색 */
export function rgba(color: Rgb, alpha: number): string {
	return rgbaRaw(color, alpha * S.alphaScale);
}

/** CSS px → 기기 px */
export function css(value: number): number {
	return value * S.dpr;
}

export function isWide(): boolean {
	return S.width / S.height > 0.95;
}

export function withAlpha(scale: number, draw: () => void): void {
	S.alphaScale = scale;
	try {
		draw();
	} finally {
		S.alphaScale = 1;
	}
}

// ───────── 투영: 요(z축 회전) · 피치 후 직교 투영. 요 0 · 피치 0 이면 가로 x · 높이 z 정면 ─────────
export function makeView(yawDegrees: number, pitchDegrees: number): View {
	const yaw = (yawDegrees * Math.PI) / 180;
	const pitch = (pitchDegrees * Math.PI) / 180;
	const cosYaw = Math.cos(yaw);
	const sinYaw = Math.sin(yaw);
	const cosPitch = Math.cos(pitch);
	const sinPitch = Math.sin(pitch);
	// u = x·cosθ − y·sinθ / 안쪽 깊이 d = x·sinθ + y·cosθ / v = z·cosφ + d·sinφ
	// 보는 사람 쪽 가까움 w = z·sinφ − d·cosφ (클수록 가깝다)
	return {
		ux: cosYaw,
		uy: -sinYaw,
		vx: sinYaw * sinPitch,
		vy: cosYaw * sinPitch,
		vz: cosPitch,
		wx: -sinYaw * cosPitch,
		wy: -cosYaw * cosPitch,
		wz: sinPitch
	};
}

// 크기 맞춤: 장면마다 시점 경로 전체에서 끌개가 들어가는 하나의 배율 · 중심은 시점마다 끌개 상자 가운데
const FIT_PADDING = 0.05;
const FIT_STRIDE = 10;
export type ProjectedBox = { minU: number; maxU: number; minV: number; maxV: number };

export function projectedBox(view: View): ProjectedBox {
	const main = S.world.main;
	let minU = Infinity;
	let maxU = -Infinity;
	let minV = Infinity;
	let maxV = -Infinity;
	for (let index = 0; index < main.length / 3; index += FIT_STRIDE) {
		const x = main[index * 3];
		const y = main[index * 3 + 1];
		const z = main[index * 3 + 2] - CENTER_Z;
		const u = x * view.ux + y * view.uy;
		const v = x * view.vx + y * view.vy + z * view.vz;
		if (u < minU) minU = u;
		if (u > maxU) maxU = u;
		if (v < minV) minV = v;
		if (v > maxV) maxV = v;
	}
	return { minU, maxU, minV, maxV };
}

export function fitScale(views: View[]): number {
	let scale = Infinity;
	for (const view of views) {
		const box = projectedBox(view);
		scale = Math.min(
			scale,
			(S.width * (1 - FIT_PADDING)) / (box.maxU - box.minU),
			(S.height * (1 - FIT_PADDING)) / (box.maxV - box.minV)
		);
	}
	return scale;
}

export function setFrame(view: View, scale: number): void {
	const box = projectedBox(view);
	S.frame = {
		view,
		scale,
		cx: S.width / 2,
		cy: S.height / 2,
		offsetU: (box.minU + box.maxU) / 2,
		offsetV: (box.minV + box.maxV) / 2
	};
}

/** 투영 가운데를 옮긴다(끝 화면 · 7-4 · 7-5 · 4-5) */
export function moveFrame(cx: number, cy: number): void {
	S.frame.cx = cx;
	S.frame.cy = cy;
}

/** 다른 계산(세 천체)의 맞춤으로 투영을 통째로 바꾼다 */
export function replaceFrame(frame: Frame): void {
	S.frame = frame;
}

export function screenX(x: number, y: number): number {
	const frame = S.frame;
	return frame.cx + (x * frame.view.ux + y * frame.view.uy - frame.offsetU) * frame.scale;
}

export function screenY(x: number, y: number, z: number): number {
	const frame = S.frame;
	return (
		frame.cy -
		(x * frame.view.vx + y * frame.view.vy + (z - CENTER_Z) * frame.view.vz - frame.offsetV) *
			frame.scale
	);
}

export function projectX(array: Series, index: number): number {
	return screenX(array[index * 3], array[index * 3 + 1]);
}

export function projectY(array: Series, index: number): number {
	return screenY(array[index * 3], array[index * 3 + 1], array[index * 3 + 2]);
}

/** 효과 1: 0(멀다) ~ 1(가깝다) */
export function nearness(array: Series, index: number): number {
	const view = S.frame.view;
	return clamp01(
		0.5 +
			(array[index * 3] * view.wx +
				array[index * 3 + 1] * view.wy +
				(array[index * 3 + 2] - CENTER_Z) * view.wz) /
				(2 * DEPTH_RANGE)
	);
}

export function depthBright(near: number): number {
	return lerp(DEPTH_BRIGHT[0], DEPTH_BRIGHT[1], near);
}

export function depthWidth(near: number): number {
	return lerp(DEPTH_WIDTH[0], DEPTH_WIDTH[1], near);
}

/** 효과 3: 그 걸음의 속도 |dX/dt| → 0~1 */
export function speedAmount(array: Series, index: number): number {
	const x = array[index * 3];
	const y = array[index * 3 + 1];
	const z = array[index * 3 + 2];
	return smoothstep(
		SPEED_RANGE[0],
		SPEED_RANGE[1],
		Math.hypot(SIGMA * (y - x), x * (RHO - z) - y, x * y - BETA * z)
	);
}

export function speedBright(array: Series, index: number): number {
	return lerp(SPEED_BRIGHT[0], SPEED_BRIGHT[1], speedAmount(array, index));
}

/** 소수 걸음 위치(빛 머리)의 화면 좌표: 두 계산점 사이 직선 보간(같은 궤적 위) */
export function headPoint(array: Series, head: number): [number, number] {
	const index = Math.floor(head);
	const fraction = head - index;
	if (fraction === 0) return [projectX(array, index), projectY(array, index)];
	return [
		lerp(projectX(array, index), projectX(array, index + 1), fraction),
		lerp(projectY(array, index), projectY(array, index + 1), fraction)
	];
}

// ───────── 빛 머리(미리 그린 방사형 점). 효과 3: 작은 심 + 넓은 번짐 ─────────
const SPRITE_SIZE = 128;
type SpriteName = 'white' | 'gold' | 'ensemble' | 'dust' | 'flash';
let sprites: Record<SpriteName, HTMLCanvasElement> | null = null;

function makeSprite(core: Rgb, halo: Rgb, spread: number): HTMLCanvasElement {
	const sprite = document.createElement('canvas');
	sprite.width = SPRITE_SIZE;
	sprite.height = SPRITE_SIZE;
	const spriteContext = sprite.getContext('2d');
	if (spriteContext === null) return sprite;
	const half = SPRITE_SIZE / 2;
	const gradient = spriteContext.createRadialGradient(half, half, 0, half, half, half);
	gradient.addColorStop(0, rgbaRaw(core, 1));
	gradient.addColorStop(0.035 * spread, rgbaRaw(core, 0.95));
	gradient.addColorStop(0.09 * spread, rgbaRaw(halo, 0.42));
	gradient.addColorStop(Math.min(0.9, 0.24 * spread), rgbaRaw(halo, 0.12));
	gradient.addColorStop(Math.min(0.95, 0.5 * spread), rgbaRaw(halo, 0.035));
	gradient.addColorStop(1, rgbaRaw(halo, 0));
	spriteContext.fillStyle = gradient;
	spriteContext.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
	return sprite;
}

export function sprite(name: SpriteName): HTMLCanvasElement {
	if (sprites === null) {
		sprites = {
			white: makeSprite(WHITE, [255, 232, 190], 1),
			gold: makeSprite([255, 226, 160], GOLD, 1),
			ensemble: makeSprite(WHITE, [255, 230, 196], 1),
			dust: makeSprite(WHITE, [255, 222, 170], 2.2),
			flash: makeSprite(WHITE, [255, 236, 205], 1.6)
		};
	}
	return sprites[name];
}

export function drawSprite(
	name: SpriteName,
	x: number,
	y: number,
	sizeCss: number,
	alpha: number
): void {
	if (alpha <= 0) return;
	const size = sizeCss * S.dpr;
	const context = S.context;
	context.globalAlpha = Math.min(1, alpha * S.alphaScale);
	context.drawImage(sprite(name), x - size / 2, y - size / 2, size, size);
	context.globalAlpha = 1;
}

// ───────── 효과 3 빛 번짐(bloom): 그린 화면을 1/2 → 1/4 → 1/8 → 1/16 로 줄인 흐린 판을 가산 합성 ─────────
type BloomLayer = {
	divisor: number;
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D | null;
};
const BLOOM_DIVISORS = [2, 4, 8, 16];
const BLOOM_UP_WEIGHT = 0.8; // 거친 판을 한 단계 고운 판에 더할 때의 세기
const BLOOM_ADD = 0.5; // 최종 번짐 판(1/4)을 화면에 더하는 세기
let bloomLayers: BloomLayer[] = [];

export function resizeBloom(): void {
	if (bloomLayers.length === 0) {
		bloomLayers = BLOOM_DIVISORS.map((divisor) => {
			const layer = document.createElement('canvas');
			return { divisor, canvas: layer, context: layer.getContext('2d') };
		});
	}
	for (const layer of bloomLayers) {
		layer.canvas.width = Math.max(1, Math.round(S.width / layer.divisor));
		layer.canvas.height = Math.max(1, Math.round(S.height / layer.divisor));
	}
}

/** 번짐 판이 차지한 메모리를 놓는다(렌더러 정리) */
export function releaseBloom(): void {
	for (const layer of bloomLayers) {
		layer.canvas.width = 0;
		layer.canvas.height = 0;
	}
	bloomLayers = [];
}

export function applyBloom(strength: number): void {
	if (strength <= 0) return;
	const context = S.context;
	// 내려가기: 반씩 줄여 고르게 흐리게
	let source: HTMLCanvasElement = context.canvas;
	for (const layer of bloomLayers) {
		if (layer.context === null) return;
		layer.context.globalCompositeOperation = 'copy';
		layer.context.globalAlpha = 1;
		layer.context.imageSmoothingEnabled = true;
		layer.context.drawImage(source, 0, 0, layer.canvas.width, layer.canvas.height);
		source = layer.canvas;
	}
	// 올라가기: 1/16 → 1/8 → 1/4 로 두 배씩 키워 더한다(한 번에 크게 키울 때의 네모 자국 방지)
	for (let index = bloomLayers.length - 1; index >= 2; index--) {
		const target = bloomLayers[index - 1];
		if (target.context === null) return;
		target.context.globalCompositeOperation = 'lighter';
		target.context.globalAlpha = BLOOM_UP_WEIGHT;
		target.context.drawImage(
			bloomLayers[index].canvas,
			0,
			0,
			target.canvas.width,
			target.canvas.height
		);
	}
	context.globalCompositeOperation = 'lighter';
	context.imageSmoothingEnabled = true;
	context.globalAlpha = Math.min(1, BLOOM_ADD * strength); // 암전 중이면 원본이 이미 옅어져 있다
	context.drawImage(bloomLayers[1].canvas, 0, 0, S.width, S.height);
	context.globalAlpha = 1;
}

// ───────── 꼬리(궤적 묶음): 짧은 조각마다 밝기 · 따뜻함 · 굵기를 정하고, 같은 값끼리 모아 한 번에 긋는다(가산 합성이라 순서 무관) ─────────
export type TrailStyle = { alpha: number; warm: number; width: number };
/** age: 머리에서 떨어진 걸음 수, index: 조각 가운데 걸음 */
export type TrailLook = (age: number, index: number) => TrailStyle | null;
type TrailPiece = { array: Series; start: number; end: number };

const ALPHA_FLOOR = 0.012;
const ALPHA_STEP = Math.log(1.12);
const WARM_LEVELS = 10;
const WIDTH_STEP = 0.25;
const WIDTH_LEVELS = 64;
const buckets = new Map<number, TrailPiece[]>();

export function addTrail(
	array: Series,
	from: number,
	head: number,
	group: number,
	look: TrailLook
): void {
	if (head <= from) return;
	const lastIndex = array.length / 3 - 1;
	for (let groupStart = Math.floor(from / group) * group; groupStart < head; groupStart += group) {
		const start = Math.max(from, groupStart);
		const end = Math.min(head, groupStart + group);
		const middle = Math.min(lastIndex, Math.round((start + end) / 2));
		const style = look(head - (start + end) / 2, middle);
		if (style === null || style.alpha < ALPHA_FLOOR) continue;
		const alphaLevel = Math.round(Math.log(Math.min(1, style.alpha) / ALPHA_FLOOR) / ALPHA_STEP);
		const warmLevel = Math.round(clamp01(style.warm) * WARM_LEVELS);
		const widthLevel = Math.max(1, Math.round(style.width / WIDTH_STEP));
		const key =
			(alphaLevel * (WARM_LEVELS + 1) + warmLevel) * WIDTH_LEVELS +
			Math.min(WIDTH_LEVELS - 1, widthLevel);
		let list = buckets.get(key);
		if (list === undefined) {
			list = [];
			buckets.set(key, list);
		}
		const previous = list.length > 0 ? list[list.length - 1] : null;
		if (previous !== null && previous.array === array && previous.end === start) previous.end = end;
		else list.push({ array, start, end });
	}
}

export function flushTrails(): void {
	const context = S.context;
	for (const [key, list] of buckets) {
		const widthLevel = key % WIDTH_LEVELS;
		const colorKey = Math.floor(key / WIDTH_LEVELS);
		const warmLevel = colorKey % (WARM_LEVELS + 1);
		const alphaLevel = Math.floor(colorKey / (WARM_LEVELS + 1));
		context.strokeStyle = rgba(
			warmColor(warmLevel / WARM_LEVELS),
			ALPHA_FLOOR * Math.exp(alphaLevel * ALPHA_STEP)
		);
		context.lineWidth = widthLevel * WIDTH_STEP * S.dpr;
		context.beginPath();
		for (const { array, start, end } of list) {
			const firstIndex = Math.ceil(start);
			if (firstIndex > start) {
				const [x, y] = headPoint(array, start);
				context.moveTo(x, y);
			} else {
				context.moveTo(projectX(array, firstIndex), projectY(array, firstIndex));
			}
			const lastWhole = Math.floor(end);
			for (let index = firstIndex + 1; index <= lastWhole; index++)
				context.lineTo(projectX(array, index), projectY(array, index));
			if (end > lastWhole) {
				const [x, y] = headPoint(array, end);
				context.lineTo(x, y);
			}
		}
		context.stroke();
	}
	buckets.clear();
}

/** 머리 바로 뒤 짧은 구간에 넓고 옅은 획을 겹쳐 빛이 번지게 한다(효과 3) */
export function drawHeadGlow(
	array: Series,
	head: number,
	length: number,
	color: Rgb,
	alpha: number
): void {
	if (alpha <= 0 || head <= 0) return;
	const context = S.context;
	const from = Math.max(0, head - length);
	context.lineCap = 'round'; // 넓은 획의 네모 끝이 보이지 않게
	for (const [widthCss, strength] of [
		[7, 0.07],
		[16, 0.025]
	]) {
		context.strokeStyle = rgba(color, alpha * strength);
		context.lineWidth = widthCss * S.dpr;
		context.beginPath();
		const [x0, y0] = headPoint(array, from);
		context.moveTo(x0, y0);
		for (let index = Math.ceil(from); index < head; index++)
			context.lineTo(projectX(array, index), projectY(array, index));
		const [x1, y1] = headPoint(array, head);
		context.lineTo(x1, y1);
		context.stroke();
	}
	context.lineCap = 'butt';
}

// 시간으로 흐르는 빛(이미 그려진 궤적 위로 밝기 띠가 지나간다). 모양 · 걸음 수는 바꾸지 않는다
const PULSE_BANDS = 3;
const PULSE_PERIOD_S = 14;
export function pulse(stepIndex: number, stepCount: number, seconds: number): number {
	const phase = (stepIndex / stepCount) * PULSE_BANDS - (seconds / PULSE_PERIOD_S) * PULSE_BANDS;
	return Math.pow(Math.max(0, Math.cos(phase * Math.PI * 2)), 14);
}

export const MAIN_GROUP = 5;
const MAIN_TAIL = 260;
/** 기준 궤적: 머리 쪽은 흰빛 · 굵게, 오래된 길은 금빛으로 남아 겹겹이 쌓인다. 깊이 · 속도가 밝기 · 굵기를 바꾼다 */
export function mainLook(
	base: number,
	peak: number,
	pulseAmount: number,
	seconds: number
): TrailLook {
	const main = S.world.main;
	const steps = main.length / 3 - 1;
	return (age, index) => {
		const fresh = Math.exp(-age / MAIN_TAIL);
		const near = nearness(main, index);
		const speed = speedAmount(main, index);
		let alpha = base + (peak - base) * fresh;
		if (pulseAmount > 0) alpha += pulseAmount * pulse(index, steps, seconds);
		alpha *= depthBright(near) * lerp(SPEED_BRIGHT[0], SPEED_BRIGHT[1], speed);
		const warm = WARM_GOLD_AT * (1 - fresh) * (1 - SPEED_COOL * speed);
		return { alpha, warm, width: (1 + 0.9 * fresh) * depthWidth(near) };
	};
}

// ───────── 파문 · 빛 실(4-4 · 6-3 짝 계산, 2-5 · 3-5 · 5-4 갈라짐) ─────────
/** 두 점을 잇는 빛 실은 거리(3D, 모형 단위)가 이만큼을 넘는 걸음에서 끊긴다 */
const THREAD_BREAK = 6;
/** 파문이 퍼지는 동안의 비트 진행값 폭(휴대폰 약 11vh) */
export const RIPPLE_SPAN_P = 0.035;
const RIPPLE_RADIUS_CSS = [3, 34] as const;
const pairBreakSteps = new WeakMap<Float32Array, number>();

/** 짝 계산이 처음 THREAD_BREAK 를 넘는 걸음 */
export function pairBreakStep(): number {
	const [first, second] = S.world.pair;
	const cached = pairBreakSteps.get(first);
	if (cached !== undefined) return cached;
	const steps = first.length / 3 - 1;
	let found = steps;
	for (let index = 0; index <= steps; index++) {
		const distance = Math.hypot(
			first[index * 3] - second[index * 3],
			first[index * 3 + 1] - second[index * 3 + 1],
			first[index * 3 + 2] - second[index * 3 + 2]
		);
		if (distance > THREAD_BREAK) {
			found = index;
			break;
		}
	}
	pairBreakSteps.set(first, found);
	return found;
}

function pairDistance(head: number): number {
	const [first, second] = S.world.pair;
	const steps = first.length / 3 - 1;
	const index = Math.floor(head);
	const next = Math.min(steps, index + 1);
	const fraction = head - index;
	const point = (array: Float32Array): number[] =>
		[0, 1, 2].map((k) => lerp(array[index * 3 + k], array[next * 3 + k], fraction));
	const a = point(first);
	const b = point(second);
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function drawThread(
	head: number,
	appear: number,
	goldPoint: [number, number],
	whitePoint: [number, number]
): void {
	if (head >= pairBreakStep()) return;
	const context = S.context;
	const stretch = clamp01(pairDistance(head) / THREAD_BREAK);
	const alpha = appear * 0.9 * Math.pow(1 - stretch, 0.6);
	const gradient = context.createLinearGradient(
		goldPoint[0],
		goldPoint[1],
		whitePoint[0],
		whitePoint[1]
	);
	gradient.addColorStop(0, rgba(GOLD, alpha));
	gradient.addColorStop(1, rgba(WHITE, alpha));
	context.strokeStyle = gradient;
	context.lineWidth = lerp(1.4, 0.6, stretch) * S.dpr;
	context.beginPath();
	context.moveTo(goldPoint[0], goldPoint[1]);
	context.lineTo(whitePoint[0], whitePoint[1]);
	context.stroke();
}

/** 4-4 · 6-3: 짝 계산이 끊긴 걸음에서 파문. knots = 진행값 → 걸음 */
export function drawPairRipple(knots: Knots, p: number, appear: number): void {
	const breakStep = pairBreakStep();
	const breakP = inversePiecewise(knots, breakStep);
	const t = (p - breakP) / RIPPLE_SPAN_P;
	if (t < 0 || t > 1) return;
	const [first, second] = S.world.pair;
	// 끊긴 순간 두 점의 가운데(3D)를 지금 시점으로 투영
	const middle = [0, 1, 2].map((k) => (first[breakStep * 3 + k] + second[breakStep * 3 + k]) / 2);
	drawRippleAt(screenX(middle[0], middle[1]), screenY(middle[0], middle[1], middle[2]), t, appear);
}

/** 공용 파문: 갈라진 자리(x, y 기기 px)에서 t 0→1 동안 고리가 퍼지며 사그라든다 */
export function drawRippleAt(x: number, y: number, t: number, appear: number): void {
	if (t < 0 || t > 1) return;
	const context = S.context;
	const eased = 1 - Math.pow(1 - t, 3);
	context.strokeStyle = rgba(mix(GOLD, WHITE, 0.5), appear * 0.75 * Math.pow(1 - t, 1.6));
	context.lineWidth = lerp(1.6, 0.5, t) * S.dpr;
	context.beginPath();
	context.arc(
		x,
		y,
		lerp(RIPPLE_RADIUS_CSS[0], RIPPLE_RADIUS_CSS[1], eased) * S.dpr,
		0,
		Math.PI * 2
	);
	context.stroke();
	drawSprite('flash', x, y, 54, appear * Math.pow(1 - t, 2.5));
}

// ───────── 선 · 글 ─────────
/** 그림 상자: 가장자리 · 연도 구석을 피한 영역(기기 px) */
export type StageBox = {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
	cx: number;
	cy: number;
};

export function stageBox(): StageBox {
	const wide = isWide();
	const left = S.width * (wide ? 0.1 : 0.07);
	const right = S.width * (wide ? 0.9 : 0.93);
	const top = S.height * (wide ? 0.14 : 0.1);
	const bottom = S.height * (wide ? 0.86 : 0.92);
	return {
		left,
		right,
		top,
		bottom,
		width: right - left,
		height: bottom - top,
		cx: (left + right) / 2,
		cy: (top + bottom) / 2
	};
}

/** 점 목록([x0, y0, x1, y1, …] 기기 px)을 빛 실로: 넓고 옅은 번짐 두 겹 + 가는 심 */
export function strokePoints(points: number[], color: Rgb, alpha: number, widthCss: number): void {
	if (alpha <= 0 || points.length < 4) return;
	const context = S.context;
	context.lineCap = 'round';
	for (const [scale, strength] of [
		[5, 0.06],
		[2.2, 0.2],
		[1, 1]
	]) {
		context.strokeStyle = rgba(color, alpha * strength);
		context.lineWidth = widthCss * scale * S.dpr;
		context.beginPath();
		context.moveTo(points[0], points[1]);
		for (let index = 2; index < points.length; index += 2)
			context.lineTo(points[index], points[index + 1]);
		context.stroke();
	}
	context.lineCap = 'butt';
}

// 위치마다 밝기가 다른 빛 실: 짧은 조각의 밝기를 FADE_LEVELS 단계로 묶어 단계마다 한 번에 긋는다
const FADE_LEVELS = 16;
const FADE_CHUNK = 4;
/** alphaAt(가운데 x, 가운데 y, 조각 첫 점 번호) → 0~1 */
export function strokeFaded(
	points: number[],
	color: Rgb,
	alpha: number,
	widthCss: number,
	alphaAt: (x: number, y: number, pointIndex: number) => number
): void {
	if (alpha <= 0 || points.length < 4) return;
	const context = S.context;
	const groups = new Map<number, number[]>();
	for (let index = 0; index + 2 < points.length; index += FADE_CHUNK * 2) {
		const end = Math.min(points.length - 2, index + FADE_CHUNK * 2);
		const level = Math.round(
			clamp01(
				alphaAt(
					(points[index] + points[end]) / 2,
					(points[index + 1] + points[end + 1]) / 2,
					index / 2
				)
			) * FADE_LEVELS
		);
		if (level === 0) continue;
		let list = groups.get(level);
		if (list === undefined) {
			list = [];
			groups.set(level, list);
		}
		list.push(index, end);
	}
	for (const [scale, strength] of [
		[4, 0.08],
		[1, 1]
	]) {
		context.lineWidth = widthCss * scale * S.dpr;
		for (const [level, list] of groups) {
			context.strokeStyle = rgba(color, (alpha * strength * level) / FADE_LEVELS);
			context.beginPath();
			for (let k = 0; k < list.length; k += 2) {
				context.moveTo(points[list[k]], points[list[k] + 1]);
				for (let index = list[k] + 2; index <= list[k + 1]; index += 2)
					context.lineTo(points[index], points[index + 1]);
			}
			context.stroke();
		}
	}
}

export type LabelOptions = { weight?: number; font?: string; align?: CanvasTextAlign };

export function drawLabel(
	text: string,
	x: number,
	y: number,
	sizeCss: number,
	color: Rgb,
	alpha: number,
	options: LabelOptions = {}
): void {
	if (alpha <= 0) return;
	const context = S.context;
	const weight = options.weight === undefined ? 400 : options.weight;
	const font = options.font === undefined ? FONT_SANS : options.font;
	context.font = `${weight} ${Math.round(css(sizeCss))}px ${font}`;
	context.textAlign = options.align === undefined ? 'center' : options.align;
	context.textBaseline = 'middle';
	context.fillStyle = rgba(color, alpha);
	context.fillText(text, x, y);
}

export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): void {
	const context = S.context;
	context.beginPath();
	context.moveTo(x + r, y);
	context.arcTo(x + w, y, x + w, y + h, r);
	context.arcTo(x + w, y + h, x, y + h, r);
	context.arcTo(x, y + h, x, y, r);
	context.arcTo(x, y, x + w, y, r);
	context.closePath();
}

// ───────── 연도 굴림(오도미터, DOM): 자리마다 0~9(+0) 띠를 굴려 숫자를 바꾼다. 값이 소수면 다음 숫자로 넘어가는 중 ─────────
export const YEAR_PLACES = 4;
/** 띠 한 칸 높이(em) · '년대' 칸 최대 너비(em) */
export const YEAR_LINE_EM = 1.2;
export const YEAR_SUFFIX_EM = 2.2;

/** 천 · 백 · 십 · 일 자리 띠의 위치(칸 수, 0~10). 아랫자리가 모두 9 일 때만 윗자리도 함께 넘어간다 */
export function yearStripPositions(value: number): number[] {
	const whole = Math.floor(value);
	const fraction = value - whole;
	const positions: number[] = [];
	for (let place = YEAR_PLACES - 1; place >= 0; place--) {
		const power = 10 ** place;
		let position = Math.floor(whole / power) % 10;
		if (place === 0 || whole % power === power - 1) position += fraction;
		positions.push(position);
	}
	return positions;
}
