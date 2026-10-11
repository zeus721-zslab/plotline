// 마지막 2시간 40분 미리 그린 층(시제품 v3 그대로 옮김, D-43). 화면 크기가 바뀔 때만 다시 그린다.
// 배 · 빙산 · 보트는 평면 실루엣, 하늘 · 별 · 바다는 빛으로 그린다. 그리기 수치는 v3 원본과 같다.
import { clamp01 } from './skyData.ts';

export type View = {
	w: number;
	h: number;
	pr: number;
	landscape: boolean;
	// 시안 크기 배율(시안 패널 폭 390 기준)
	s: number;
	// 투시 초점 거리(px)
	f: number;
};

type Point = [number, number];
type ToPixel = (x: number, y: number) => Point;
type Context = CanvasRenderingContext2D;
export type Rgb = [number, number, number];

export function layer(width: number, height: number): HTMLCanvasElement {
	const surface = document.createElement('canvas');
	surface.width = Math.max(1, Math.ceil(width));
	surface.height = Math.max(1, Math.ceil(height));
	return surface;
}

export function context2d(surface: HTMLCanvasElement): Context {
	const found = surface.getContext('2d');
	if (found === null) throw new Error('2d context unavailable');
	return found;
}

// ── 시안 공통 도구(그대로) ──
export function rng(seed: number): () => number {
	let v = seed >>> 0;
	return () => {
		v = (v + 0x6d2b79f5) >>> 0;
		let m = v;
		m = Math.imul(m ^ (m >>> 15), m | 1);
		m ^= m + Math.imul(m ^ (m >>> 7), m | 61);
		return ((m ^ (m >>> 14)) >>> 0) / 4294967296;
	};
}

export function vgrad(
	ctx: Context,
	y0: number,
	y1: number,
	stops: Array<[number, string]>
): CanvasGradient {
	const gradient = ctx.createLinearGradient(0, y0, 0, y1);
	stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
	return gradient;
}

function smoothstepJ(e0: number, e1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
}

function fractal(levels: number, rough: number, seed: number): number[] {
	const random = rng(seed);
	const count = 1 << levels;
	const values: number[] = new Array<number>(count + 1).fill(0);
	let step = count;
	let amplitude = 1;
	while (step > 1) {
		const half = step / 2;
		for (let i = half; i < count; i += step) {
			values[i] = (values[i - half] + values[i + half]) / 2 + (random() - 0.5) * amplitude;
		}
		amplitude *= rough;
		step = half;
	}
	return values;
}

type EnvelopeKind = 'table' | 'block' | 'peak' | 'twin';
const ENVELOPES: Record<EnvelopeKind, (t: number) => number> = {
	table: (t) => smoothstepJ(0, 0.05, t) * smoothstepJ(1, 0.94, t),
	block: (t) =>
		smoothstepJ(0, 0.04, t) *
			smoothstepJ(1, 0.95, t) *
			(0.62 + 0.38 * smoothstepJ(0.5, 0.56, t) * smoothstepJ(0.8, 0.74, t)) +
		0.04 * smoothstepJ(0.2, 0.3, t),
	peak: (t) => Math.pow(Math.sin(Math.PI * t), 1.3),
	twin: (t) =>
		Math.max(
			Math.pow(Math.sin(Math.PI * Math.min(1, t / 0.6)), 1.4) * (t < 0.6 ? 1 : 0),
			0.7 * Math.pow(Math.sin(Math.PI * Math.max(0, (t - 0.35) / 0.65)), 1.2)
		)
};
export const STAR_TINTS = ['#ffffff', '#dfe8ff', '#c9d8ff', '#fff1d6', '#ffe0b8'];

// ── 색 ──
export function hexRgb(hex: string): Rgb {
	const v = parseInt(hex.slice(1), 16);
	return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
	return [
		Math.round(a[0] + (b[0] - a[0]) * t),
		Math.round(a[1] + (b[1] - a[1]) * t),
		Math.round(a[2] + (b[2] - a[2]) * t)
	];
}

export function cssRgb(color: Rgb, alpha = 1): string {
	return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
}

// ── 배: 올림픽급 측면도 비례(선미 x=0 → 선수 x=269, 물선 y=0, 단위 m) ──
const SHIP: Point[][] = [
	[
		[5, 0],
		[262.5, 0],
		[266.5, 7],
		[268.6, 14],
		[269, 18.6],
		[252, 18.1],
		[236, 17.6],
		[236, 15.1],
		[58, 15.1],
		[44, 14.9],
		[44, 16.3],
		[20, 16.6],
		[2, 16.9],
		[0.2, 14.5],
		[0.6, 9],
		[2.4, 3.5]
	],
	[
		[60, 15],
		[60, 19.8],
		[212, 19.8],
		[213.5, 15]
	],
	[
		[68, 19.7],
		[68, 22.6],
		[206, 22.6],
		[206, 19.7]
	],
	[
		[72, 22.5],
		[72, 25.2],
		[203, 25.2],
		[203, 22.5]
	],
	[
		[186, 25.1],
		[186, 28.1],
		[200, 28.1],
		[200, 25.1]
	],
	[
		[94, 25.1],
		[94, 27.0],
		[170, 27.0],
		[170, 25.1]
	]
];
export const SHIP_LENGTH = 269;
// 돛대 꼭대기(m)
export const SHIP_TOP_METERS = 60;
const FUNNELS = [173.5, 149.3, 125.1, 100.9];
// [높이, 시작 x, 끝 x, 간격]
export const LIGHT_ROWS: Array<[number, number, number, number]> = [
	[21.2, 70, 204, 2.4],
	[17.6, 62, 210, 2.2],
	[13.2, 8, 250, 1.9],
	[10.6, 12, 248, 2.0],
	[7.8, 16, 244, 2.1],
	[5.2, 24, 236, 2.3]
];
export const MAST_LIGHTS: Point[] = [
	[216.2, 45],
	[45.4, 42]
];
const MASTS: Point[][] = [
	[
		[216.6, 17.5],
		[217.5, 17.5],
		[216.3, 60],
		[215.8, 60]
	],
	[
		[45.6, 16],
		[46.5, 16],
		[45.2, 56],
		[44.7, 56]
	]
];

function tracePolygon(ctx: Context, polygon: Point[], toPx: ToPixel): void {
	polygon.forEach(([x, y], index) => {
		const [px, py] = toPx(x, y);
		if (index === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	});
	ctx.closePath();
}

export function shipPath(ctx: Context, toPx: ToPixel): void {
	ctx.beginPath();
	SHIP.forEach((polygon) => tracePolygon(ctx, polygon, toPx));
	FUNNELS.forEach((center) =>
		tracePolygon(
			ctx,
			[
				[center - 3.7, 25],
				[center + 3.7, 25],
				[center + 1.5, 46.5],
				[center - 5.9, 46.5]
			],
			toPx
		)
	);
	MASTS.forEach((polygon) => tracePolygon(ctx, polygon, toPx));
}

type ShipOptions = {
	horizon: number;
	scale: number;
	offsetX: number;
	tilt: number;
	hull: string;
	rim: string;
	s: number;
};

function drawShipLights(ctx: Context, options: ShipOptions, toPx: ToPixel): void {
	const { horizon, scale, s } = options;
	const random = rng(1912);
	ctx.save();
	LIGHT_ROWS.forEach(([height, from, to, step]) => {
		for (let x = from; x <= to; x += step) {
			if (random() < 0.3) continue;
			const [px, py] = toPx(x, height);
			const radius = Math.max(1.1 * s, 0.42 * scale);
			ctx.shadowColor = 'rgba(255,190,110,.9)';
			ctx.shadowBlur = 8 * s;
			ctx.fillStyle = random() < 0.12 ? '#fff3d8' : '#ffcf86';
			ctx.beginPath();
			ctx.arc(px, py, radius, 0, Math.PI * 2);
			ctx.fill();
			ctx.shadowBlur = 0;
			const reflectY = horizon + (horizon - py) * 1.0;
			const length = (horizon - py) * 2.4 + 20 * s;
			const gradient = ctx.createLinearGradient(
				0,
				reflectY - length * 0.2,
				0,
				reflectY + length * 0.8
			);
			gradient.addColorStop(0, 'rgba(255,200,130,0)');
			gradient.addColorStop(0.25, 'rgba(255,200,130,.42)');
			gradient.addColorStop(1, 'rgba(255,200,130,0)');
			ctx.fillStyle = gradient;
			ctx.fillRect(px - radius * 0.55, reflectY - length * 0.2, radius * 1.1, length);
		}
	});
	MAST_LIGHTS.forEach(([x, y]) => {
		const [px, py] = toPx(x, y);
		ctx.shadowColor = '#fff';
		ctx.shadowBlur = 10 * s;
		ctx.fillStyle = '#fff';
		ctx.beginPath();
		ctx.arc(px, py, 1.8 * s, 0, Math.PI * 2);
		ctx.fill();
	});
	ctx.restore();
}

/** 시안 drawShip 그대로(장면 A 배 층을 한 번 그릴 때 사용, 불빛 켬) */
function drawShip(ctx: Context, options: ShipOptions): void {
	const { horizon, scale, offsetX, tilt, s } = options;
	const pivotX = 255;
	const toPx: ToPixel = (x, y) => {
		const angle = (tilt * Math.PI) / 180;
		const dx = x - pivotX;
		const rx = dx * Math.cos(angle) - y * Math.sin(angle) + pivotX;
		const ry = dx * Math.sin(angle) + y * Math.cos(angle);
		return [offsetX + rx * scale, horizon - ry * scale];
	};
	// 반사(선체)
	ctx.save();
	ctx.translate(0, horizon * 2);
	ctx.scale(1, -1);
	ctx.globalAlpha = 0.55;
	ctx.fillStyle = options.hull;
	shipPath(ctx, toPx);
	ctx.fill();
	ctx.restore();
	// 선체 · 윗변 테두리빛
	ctx.fillStyle = options.hull;
	shipPath(ctx, toPx);
	ctx.fill();
	ctx.save();
	shipPath(ctx, toPx);
	ctx.clip();
	ctx.strokeStyle = options.rim;
	ctx.lineWidth = 1.4 * s;
	ctx.translate(0, 1.2 * s);
	shipPath(ctx, toPx);
	ctx.stroke();
	ctx.restore();
	drawShipLights(ctx, options, toPx);
}

// ── 별 모양(시안 drawStars 한 별 분량을 밝기 칸별로 미리 그림) ──
export const STAR_GAIN = 1.1;
export const STAR_BUCKETS = 48;

export type StarReflection = {
	canvas: HTMLCanvasElement;
	width: number;
	length: number;
	size: number;
};
export type StarSprite = {
	canvas: HTMLCanvasElement;
	half: number;
	reflect: StarReflection | null;
};

function starReflection(tint: string, m: number, size: number, s: number): StarReflection {
	const length = (6 + m * 26) * s;
	const width = Math.max(1, size);
	const strip = layer(Math.max(1, Math.ceil(width)), length);
	const g3 = context2d(strip);
	const gradient = g3.createLinearGradient(0, 0, 0, strip.height);
	gradient.addColorStop(0, 'rgba(255,255,255,0)');
	gradient.addColorStop(0.5, tint);
	gradient.addColorStop(1, 'rgba(255,255,255,0)');
	g3.globalAlpha = 0.35 * m * STAR_GAIN;
	g3.fillStyle = gradient;
	g3.fillRect(0, 0, strip.width, strip.height);
	return { canvas: strip, width, length, size };
}

function starSprite(tint: string, bucket: number, s: number): StarSprite {
	const m = (bucket + 0.5) / STAR_BUCKETS;
	const size = (0.35 + m * 2.0) * s * STAR_GAIN;
	const alpha = Math.min(1, (0.25 + m * 1.2) * STAR_GAIN);
	const extent = m > 0.84 ? size * 10 : m > 0.5 ? size * 7 : size;
	const half = Math.ceil(extent + 2);
	const sprite = layer(half * 2, half * 2);
	const g2 = context2d(sprite);
	const x = half;
	const y = half;
	g2.globalAlpha = alpha;
	g2.fillStyle = tint;
	g2.beginPath();
	g2.arc(x, y, size, 0, Math.PI * 2);
	g2.fill();
	if (m > 0.5) {
		const halo = size * 7;
		const gradient = g2.createRadialGradient(x, y, 0, x, y, halo);
		gradient.addColorStop(0, tint);
		gradient.addColorStop(1, 'rgba(255,255,255,0)');
		g2.globalAlpha = 0.28 * STAR_GAIN * m;
		g2.fillStyle = gradient;
		g2.beginPath();
		g2.arc(x, y, halo, 0, Math.PI * 2);
		g2.fill();
	}
	if (m > 0.84) {
		const length = size * 10;
		g2.globalAlpha = 0.55 * m;
		g2.strokeStyle = tint;
		g2.lineWidth = Math.max(0.6, size * 0.22);
		g2.beginPath();
		g2.moveTo(x - length, y);
		g2.lineTo(x + length, y);
		g2.moveTo(x, y - length);
		g2.lineTo(x, y + length);
		g2.stroke();
	}
	return { canvas: sprite, half, reflect: m > 0.22 ? starReflection(tint, m, size, s) : null };
}

export function buildStarSprites(s: number): StarSprite[][] {
	return STAR_TINTS.map((tint) =>
		Array.from({ length: STAR_BUCKETS }, (_, bucket) => starSprite(tint, bucket, s))
	);
}

// ── 장면 A ──
// 진행도별 뱃머리 위치(화면 폭 비)
export const SHIP_A_SHARE = { portrait: 1.55, landscape: 0.9 };

export type SceneALayers = {
	ship: HTMLCanvasElement;
	scale: number;
	margin: number;
	waterline: number;
};

export function buildSceneA(view: View): SceneALayers {
	const { w, s, landscape } = view;
	const scale = (w * (landscape ? SHIP_A_SHARE.landscape : SHIP_A_SHARE.portrait)) / SHIP_LENGTH;
	const margin = Math.ceil(24 * s);
	const waterline = Math.ceil(SHIP_TOP_METERS * scale + margin);
	const pillarDepth = 2.92 * LIGHT_ROWS[0][0] * scale + 16 * s;
	const below = Math.ceil(Math.max(SHIP_TOP_METERS * scale, pillarDepth) + margin);
	const ship = layer(SHIP_LENGTH * scale + margin * 2, waterline + below);
	drawShip(context2d(ship), {
		horizon: waterline,
		scale,
		offsetX: margin,
		tilt: 0,
		hull: '#03050b',
		rim: 'rgba(110,140,200,.35)',
		s
	});
	return { ship, scale, margin, waterline };
}

// ── 장면 B ──
export const SHIP_B_SHARE = { portrait: 0.95, landscape: 0.9 };
export const RED_STEPS = 8;
const LIGHT_COLORS = {
	core: [hexRgb('#ffcf86'), hexRgb('#ff7a4a')],
	white: [hexRgb('#fff3d8'), hexRgb('#ffb08a')],
	glow: [
		[255, 190, 110],
		[255, 90, 50]
	],
	pillar: [
		[255, 200, 130],
		[255, 110, 70]
	]
} satisfies Record<string, [Rgb, Rgb]>;

export type LightSprite = { canvas: HTMLCanvasElement; half: number };

function lightSprite(radius: number, blur: number, core: string, glow: string): LightSprite {
	const half = Math.ceil(radius + blur * 1.5 + 2);
	const sprite = layer(half * 2, half * 2);
	const g = context2d(sprite);
	g.shadowColor = glow;
	g.shadowBlur = blur;
	g.fillStyle = core;
	g.beginPath();
	g.arc(half, half, radius, 0, Math.PI * 2);
	g.fill();
	return { canvas: sprite, half };
}

/** 앞쪽: 구명보트 뱃전과 노(사람 없음) — 시안 그대로, 흔들 수 있게 따로 그림 */
function buildBoat(view: View): HTMLCanvasElement {
	const { w, h, s } = view;
	const boat = layer(w, h + 20);
	const b = context2d(boat);
	b.fillStyle = '#010205';
	b.beginPath();
	b.moveTo(-10, h + 20);
	b.lineTo(-10, h * 0.855);
	b.quadraticCurveTo(w * 0.5, h * 0.91, w + 10, h * 0.835);
	b.lineTo(w + 10, h + 20);
	b.closePath();
	b.fill();
	b.strokeStyle = 'rgba(140,165,215,.28)';
	b.lineWidth = 1.2 * s;
	b.beginPath();
	b.moveTo(-10, h * 0.855);
	b.quadraticCurveTo(w * 0.5, h * 0.91, w + 10, h * 0.835);
	b.stroke();
	b.strokeStyle = '#010205';
	b.lineWidth = 3.4 * s;
	b.lineCap = 'round';
	b.beginPath();
	b.moveTo(w * 0.64, h * 0.9);
	b.lineTo(w * 0.97, h * 0.735);
	b.stroke();
	b.fillStyle = '#010205';
	b.beginPath();
	b.ellipse(w * 0.97, h * 0.735, 9 * s, 3.2 * s, -0.45, 0, Math.PI * 2);
	b.fill();
	b.strokeStyle = 'rgba(150,175,225,.18)';
	b.lineWidth = 0.9 * s;
	b.beginPath();
	b.ellipse(w * 0.97, h * 0.738, 18 * s, 3.6 * s, 0, 0, Math.PI * 2);
	b.stroke();
	return boat;
}

export type SceneBLayers = {
	scale: number;
	rad: number;
	dots: LightSprite[];
	whites: LightSprite[];
	pillars: HTMLCanvasElement[];
	mast: LightSprite;
	boat: HTMLCanvasElement;
	above: HTMLCanvasElement;
	aboveKey: string;
};

export function buildSceneB(view: View): SceneBLayers {
	const { w, h, s, landscape } = view;
	const scale = (w * (landscape ? SHIP_B_SHARE.landscape : SHIP_B_SHARE.portrait)) / SHIP_LENGTH;
	const rad = Math.max(1.1 * s, 0.42 * scale);
	const dots: LightSprite[] = [];
	const whites: LightSprite[] = [];
	const pillars: HTMLCanvasElement[] = [];
	for (let step = 0; step < RED_STEPS; step += 1) {
		const t = step / (RED_STEPS - 1);
		const glow = cssRgb(mixRgb(LIGHT_COLORS.glow[0], LIGHT_COLORS.glow[1], t), 0.9);
		dots.push(
			lightSprite(rad, 8 * s, cssRgb(mixRgb(LIGHT_COLORS.core[0], LIGHT_COLORS.core[1], t)), glow)
		);
		whites.push(
			lightSprite(rad, 8 * s, cssRgb(mixRgb(LIGHT_COLORS.white[0], LIGHT_COLORS.white[1], t)), glow)
		);
		const strip = layer(4, 256);
		const g = context2d(strip);
		const color = mixRgb(LIGHT_COLORS.pillar[0], LIGHT_COLORS.pillar[1], t);
		const gradient = g.createLinearGradient(0, 0, 0, 256);
		gradient.addColorStop(0, cssRgb(color, 0));
		gradient.addColorStop(0.25, cssRgb(color, 0.42));
		gradient.addColorStop(1, cssRgb(color, 0));
		g.fillStyle = gradient;
		g.fillRect(0, 0, 4, 256);
		pillars.push(strip);
	}
	const mast = lightSprite(1.8 * s, 10 * s, '#fff', '#fff');
	return {
		scale,
		rad,
		dots,
		whites,
		pillars,
		mast,
		boat: buildBoat(view),
		above: layer(w, h),
		aboveKey: ''
	};
}

export type ShipLight = {
	x: number;
	height: number;
	white: boolean;
	mast: boolean;
	// 꺼지는 순서(0 먼저 ~ 1)
	order: number;
};

/** 꺼지는 순서(0 먼저): 아래 줄 · 뱃머리 쪽부터. 시안 drawShip 과 같은 난수 순서로 불빛 목록을 만든다. */
export function shipLightList(): ShipLight[] {
	const random = rng(1912);
	const jitter = rng(98);
	const lowest = LIGHT_ROWS[LIGHT_ROWS.length - 1][0];
	const highest = LIGHT_ROWS[0][0];
	const lights: Array<{ light: ShipLight; key: number }> = [];
	LIGHT_ROWS.forEach(([height, from, to, step]) => {
		for (let x = from; x <= to; x += step) {
			if (random() < 0.3) continue;
			const white = random() < 0.12;
			const key =
				(0.58 * (height - lowest)) / (highest - lowest) +
				0.42 * (1 - x / SHIP_LENGTH) +
				(jitter() - 0.5) * 0.08;
			lights.push({ light: { x, height, white, mast: false, order: 0 }, key });
		}
	});
	MAST_LIGHTS.forEach(([x, height]) =>
		lights.push({ light: { x, height, white: true, mast: true, order: 0 }, key: 2 })
	);
	const ranked = lights.slice().sort((a, b) => a.key - b.key);
	ranked.forEach((entry, index) => {
		entry.light.order = index / (ranked.length - 1);
	});
	return lights.map((entry) => entry.light);
}

// ── 장면 C ──
export const DAWN_HORIZON = 0.62;
// 가로 화면에서 빙산 폭 기준 = 화면 높이 × 0.9
const DAWN_LANDSCAPE_OBJECT_WIDTH = 0.9;
const NIGHT_BERG = hexRgb('#0a1226');
const HAZE: Rgb = [214, 200, 172];
const BODY: Rgb = [128, 152, 172];
// 빙산 자리(화면 폭 비 · 물체 폭 비): 금성 자리를 정할 때 두 빙산 사이 틈을 쓴다.
export const MID_BERG = { centerX: 0.22, width: 0.3 };
export const BIG_BERG = { centerX: 0.7, width: 0.56 };

export type BergBox = { x0: number; width: number; height: number };
type Pass = 'dark' | 'face' | 'rim';

export function objectWidthOf(view: View): number {
	return view.landscape ? Math.min(view.w, view.h * DAWN_LANDSCAPE_OBJECT_WIDTH) : view.w;
}

function sceneryPainter(view: View, horizon: number) {
	const { w, h, s } = view;
	const objectWidth = objectWidthOf(view);
	const darkFill = cssRgb(NIGHT_BERG);

	// pass: face(시안 면 · 색) · rim(역광 테두리만, 앞 빙산이 가린 부분은 지움) · dark(밤의 검은 덩어리)
	function berg(
		L: Context,
		pass: Pass,
		centerX: number,
		width: number,
		height: number,
		distance: number,
		kind: EnvelopeKind,
		seed: number
	): void {
		const profile = fractal(7, 0.58, seed);
		const count = profile.length - 1;
		const x0 = centerX - width / 2;
		const points: Point[] = [];
		for (let i = 0; i <= count; i += 1) {
			const t = i / count;
			const envelope = ENVELOPES[kind](t);
			const v = Math.max(0, envelope * (0.9 + profile[i] * 0.28));
			points.push([x0 + t * width, horizon - v * height]);
		}
		const body = mixRgb(BODY, HAZE, distance);
		const path = (): void => {
			L.beginPath();
			L.moveTo(x0, horizon + 1);
			points.forEach(([x, y]) => L.lineTo(x, y));
			L.lineTo(x0 + width, horizon + 1);
			L.closePath();
		};
		if (pass === 'dark') {
			L.fillStyle = darkFill;
			path();
			L.fill();
			return;
		}
		if (pass === 'rim') {
			L.save();
			L.globalCompositeOperation = 'destination-out';
			path();
			L.fill();
			L.restore();
			L.save();
			path();
			L.clip();
			L.strokeStyle = `rgba(255,224,170,${0.85 - distance * 0.5})`;
			L.lineWidth = (1.6 - distance) * s;
			L.lineJoin = 'round';
			L.translate(0, 0.8 * s);
			L.beginPath();
			points.forEach(([x, y], i) => (i ? L.lineTo(x, y) : L.moveTo(x, y)));
			L.stroke();
			L.restore();
			return;
		}
		L.fillStyle = vgrad(L, horizon - height, horizon, [
			[0, cssRgb(mixRgb(body, [236, 242, 246], 0.75))],
			[0.5, cssRgb(mixRgb(body, [220, 230, 238], 0.35))],
			[1, cssRgb(body)]
		]);
		path();
		L.fill();
		// 아래쪽 물에 닿는 자리의 옅은 청록(얼음 속으로 비치는 빛)
		L.save();
		path();
		L.clip();
		L.fillStyle = vgrad(L, horizon - height * 0.35, horizon, [
			[0, 'rgba(90,160,180,0)'],
			[1, `rgba(110,175,190,${0.35 * (1 - distance)})`]
		]);
		L.fillRect(x0, horizon - height * 0.35, width, height * 0.35);
		L.restore();
	}

	// 실제 빙산 단서: 비대칭(한쪽 절벽 · 한쪽 계단), 각진 꺾임, 면마다 다른 밝기, 물에 깎인 아랫단
	function bergShape(seed: number, spikeAt: number): Point[] {
		const random = rng(seed);
		const points: Point[] = [
			[0, 0],
			[0.015, 0.22 + random() * 0.1]
		];
		let x = 0.04;
		let y = 0.62 + random() * 0.12;
		points.push([x, y]);
		let spiked = false;
		while (x < 0.86) {
			const k = random();
			if (!spiked && x > spikeAt) {
				points.push(
					[x + 0.05, y + 0.16],
					[x + 0.08, y + 0.2],
					[x + 0.11, Math.min(0.95, y + 0.3)],
					[x + 0.14, y + 0.22],
					[x + 0.18, y + 0.06]
				);
				x += 0.18;
				y += 0.06;
				spiked = true;
			} else if (k < 0.4) {
				x += 0.06 + random() * 0.08;
				y += (random() - 0.5) * 0.05;
			} else if (k < 0.65) {
				x += 0.008 + random() * 0.014;
				y += (random() < 0.6 ? -1 : 1) * (0.07 + random() * 0.1);
			} else {
				x += 0.05 + random() * 0.06;
				y += (random() - 0.55) * 0.18;
			}
			y = Math.min(0.92, Math.max(0.3, y));
			points.push([x, y]);
		}
		points.push([0.9, y * 0.7], [0.93, y * 0.6], [0.97, 0.2], [1, 0]);
		return points;
	}

	function realBergFace(L: Context, shape: Point[], box: BergBox, seed: number, distance: number) {
		const { x0, width, height } = box;
		const points = shape.map(([u, v]): Point => [x0 + u * width, horizon - v * height]);
		const path = (): void => {
			L.beginPath();
			points.forEach(([px, py], i) => (i ? L.lineTo(px, py) : L.moveTo(px, py)));
			L.closePath();
		};
		const body = mixRgb(BODY, HAZE, distance);
		L.fillStyle = vgrad(L, horizon - height, horizon, [
			[0, cssRgb(mixRgb(body, [238, 243, 247], 0.78))],
			[0.55, cssRgb(mixRgb(body, [222, 231, 239], 0.4))],
			[1, cssRgb(body)]
		]);
		path();
		L.fill();
		L.save();
		path();
		L.clip();
		const random = rng(seed + 100);
		const cuts = shape
			.filter((_, i) => i > 2 && i < shape.length - 3 && random() < 0.45)
			.map(([u]) => u);
		const edges = [0, ...cuts, 1];
		for (let i = 0; i < edges.length - 1; i += 1) {
			const a = x0 + edges[i] * width;
			const b = x0 + edges[i + 1] * width;
			const lean = (random() - 0.3) * width * 0.05;
			const tone = random();
			L.fillStyle =
				tone < 0.4
					? `rgba(55,82,110,${0.22 + random() * 0.12})`
					: tone < 0.75
						? 'rgba(0,0,0,0)'
						: `rgba(255,238,214,${0.12 + random() * 0.1})`;
			L.beginPath();
			L.moveTo(a, horizon - height * 1.1);
			L.lineTo(b, horizon - height * 1.1);
			L.lineTo(b + lean, horizon + 2);
			L.lineTo(a + lean, horizon + 2);
			L.closePath();
			L.fill();
		}
		for (let i = 0; i < 14; i += 1) {
			const u = random();
			const xx = x0 + u * width;
			const top = horizon - height * (0.15 + random() * 0.6);
			L.strokeStyle = `rgba(60,90,118,${0.12 + random() * 0.16})`;
			L.lineWidth = (0.6 + random() * 0.8) * s;
			L.beginPath();
			L.moveTo(xx, top);
			L.lineTo(xx + (random() - 0.5) * 3 * s, top + height * (0.1 + random() * 0.3));
			L.stroke();
		}
		L.fillStyle = vgrad(L, horizon - height * 0.07, horizon, [
			[0, 'rgba(40,70,92,0)'],
			[0.6, 'rgba(40,70,92,.38)'],
			[1, 'rgba(90,165,180,.55)']
		]);
		L.fillRect(x0, horizon - height * 0.07, width, height * 0.07 + 2);
		L.restore();
	}

	function realBerg(
		L: Context,
		pass: Pass,
		centerX: number,
		width: number,
		height: number,
		seed: number,
		spikeAt: number,
		distance: number
	): BergBox {
		const shape = bergShape(seed, spikeAt);
		const box = { x0: centerX - width / 2, width, height };
		const points = shape.map(([u, v]): Point => [box.x0 + u * width, horizon - v * height]);
		const path = (): void => {
			L.beginPath();
			points.forEach(([px, py], i) => (i ? L.lineTo(px, py) : L.moveTo(px, py)));
			L.closePath();
		};
		if (pass === 'dark') {
			L.fillStyle = darkFill;
			path();
			L.fill();
			return box;
		}
		if (pass === 'rim') {
			L.save();
			L.globalCompositeOperation = 'destination-out';
			path();
			L.fill();
			L.restore();
			L.save();
			path();
			L.clip();
			L.strokeStyle = `rgba(255,226,176,${0.9 - distance * 0.5})`;
			L.lineWidth = 1.5 * s;
			L.lineJoin = 'miter';
			L.translate(0, 0.9 * s);
			L.beginPath();
			points.slice(1, -1).forEach(([px, py], i) => (i ? L.lineTo(px, py) : L.moveTo(px, py)));
			L.stroke();
			L.restore();
			return box;
		}
		realBergFace(L, shape, box, seed, distance);
		return box;
	}

	// 먼 유빙 벌판(수평선을 따라 낮고 길게)
	function iceField(L: Context, pass: Pass): void {
		if (pass === 'rim') return;
		const field = fractal(9, 0.62, 21);
		L.fillStyle = pass === 'dark' ? darkFill : cssRgb(mixRgb([150, 150, 150], HAZE, 0.55));
		L.beginPath();
		L.moveTo(0, horizon + 1);
		field.forEach((v, i) => {
			const x = (i / (field.length - 1)) * w * 0.58;
			L.lineTo(x, horizon - (2.2 + v * 3) * s * (0.6 + 0.4 * Math.sin(i * 0.05)));
		});
		L.lineTo(w * 0.58, horizon + 1);
		L.closePath();
		L.fill();
	}

	return (L: Context, pass: Pass): { midBerg: BergBox; bigBerg: BergBox } => {
		iceField(L, pass);
		berg(L, pass, w * 0.08, objectWidth * 0.16, h * 0.022, 0.85, 'table', 2);
		berg(L, pass, w * 0.42, objectWidth * 0.1, h * 0.028, 0.8, 'twin', 3);
		berg(L, pass, w * 0.93, objectWidth * 0.2, h * 0.026, 0.82, 'table', 4);
		const midBerg = realBerg(
			L,
			pass,
			w * MID_BERG.centerX,
			objectWidth * MID_BERG.width,
			h * 0.055,
			31,
			0.9,
			0.5
		);
		const bigBerg = realBerg(
			L,
			pass,
			w * BIG_BERG.centerX,
			objectWidth * BIG_BERG.width,
			h * 0.19,
			7,
			0.45,
			0.08
		);
		return { midBerg, bigBerg };
	};
}

/** 바다 위 층: 물빛 길 · 잔물결(시안과 같은 난수 순서) */
function buildSeaLayers(
	view: View,
	horizon: number,
	sunX: number
): { glitter: HTMLCanvasElement; ripples: HTMLCanvasElement } {
	const { w, h, s } = view;
	const glitter = layer(w, h);
	const ripples = layer(w, h);
	const gl = context2d(glitter);
	const rp = context2d(ripples);
	const random = rng(8);
	for (let i = 0; i < 520; i += 1) {
		const depth = Math.pow(random(), 1.6);
		const y = horizon + 2 * s + depth * (h - horizon);
		const spread = (10 + depth * 120) * s;
		const x = sunX + (random() - 0.5) * 2 * spread;
		const length = (3 + random() * 10 + depth * 30) * s;
		gl.fillStyle = `rgba(255,228,180,${(0.08 + random() * 0.3) * (1 - depth * 0.8)})`;
		gl.fillRect(x - length / 2, y, length, Math.max(1, 0.8 * s));
	}
	for (let i = 0; i < 260; i += 1) {
		const depth = Math.pow(random(), 1.7);
		const y = horizon + depth * (h - horizon);
		const length = (8 + random() * 30) * s * (1 + depth * 3);
		rp.fillStyle =
			random() < 0.5
				? `rgba(0,0,0,${0.08 + depth * 0.12})`
				: `rgba(210,215,225,${0.04 + 0.05 * (1 - depth)})`;
		rp.fillRect(random() * w - length / 2, y, length, Math.max(1, (0.6 + depth) * s));
	}
	return { glitter, ripples };
}

/** 앞쪽 떠다니는 작은 얼음 조각: 그림자 + 밤 색 / 면 / 테두리 */
function buildFloats(view: View): {
	floatsDark: HTMLCanvasElement;
	floatsFace: HTMLCanvasElement;
	floatsRim: HTMLCanvasElement;
} {
	const { w, h, s } = view;
	const floatsDark = layer(w, h);
	const floatsFace = layer(w, h);
	const floatsRim = layer(w, h);
	const fd = context2d(floatsDark);
	const ff = context2d(floatsFace);
	const fr = context2d(floatsRim);
	const darkFill = cssRgb(NIGHT_BERG);
	const pieces: Array<[number, number, number, number]> = [
		[0.18, 0.8, 26, 5],
		[0.4, 0.9, 40, 7],
		[0.85, 0.86, 30, 6],
		[0.07, 0.95, 50, 9]
	];
	pieces.forEach(([fx, fy, fw, fh], i) => {
		const profile = fractal(5, 0.6, 40 + i);
		const cx = fx * w;
		const cy = fy * h;
		const ww = fw * s;
		const hh = fh * s;
		fd.fillStyle = 'rgba(0,0,0,.35)';
		fd.beginPath();
		fd.ellipse(cx, cy + 1.5 * s, ww * 0.55, hh * 0.45, 0, 0, Math.PI * 2);
		fd.fill();
		const piece = (g: Context): void => {
			g.beginPath();
			g.moveTo(cx - ww / 2, cy);
			profile.forEach((v, k) => {
				const t = k / (profile.length - 1);
				g.lineTo(cx - ww / 2 + t * ww, cy - Math.sin(Math.PI * t) * hh * (0.8 + v * 0.6));
			});
			g.lineTo(cx + ww / 2, cy);
			g.closePath();
		};
		fd.fillStyle = darkFill;
		piece(fd);
		fd.fill();
		ff.fillStyle = '#8ea3b4';
		piece(ff);
		ff.fill();
		fr.strokeStyle = 'rgba(255,224,170,.5)';
		fr.lineWidth = 0.9 * s;
		piece(fr);
		fr.stroke();
	});
	return { floatsDark, floatsFace, floatsRim };
}

/** 오로라(상상): 화면 위 왼쪽, v1 색(아래 초록 → 위 자주) */
function buildAurora(view: View): HTMLCanvasElement {
	const { w, h, s } = view;
	const aurora = layer(w, h * 0.5);
	const au = context2d(aurora);
	const random = rng(355);
	const ray = fractal(8, 0.7, 77);
	const columnWidth = Math.max(1, Math.round(2 * s));
	const span = w * 0.62;
	for (let x = 0; x < span; x += columnWidth) {
		const t = x / span;
		const envelope = Math.pow(Math.sin(Math.PI * t), 1.2);
		const rayValue = ray[Math.floor(t * (ray.length - 1))];
		const base = h * (0.3 + 0.04 * Math.sin(t * 5 + 1) + 0.02 * rayValue);
		const rays = 0.35 + 0.65 * Math.pow(clamp01(0.5 + rayValue * 0.9 + (random() - 0.5) * 0.3), 2);
		const folds = 0.55 + 0.45 * Math.sin(t * 22 + Math.sin(t * 7) * 2);
		const intensity = envelope * rays * folds;
		const top = base - h * 0.2;
		const gradient = au.createLinearGradient(0, top, 0, base + h * 0.01);
		gradient.addColorStop(0, 'rgba(107,31,92,0)');
		gradient.addColorStop(0.45, `rgba(107,31,92,${0.35 * intensity})`);
		gradient.addColorStop(0.9, `rgba(15,204,87,${0.8 * intensity})`);
		gradient.addColorStop(1, 'rgba(15,204,87,0)');
		au.fillStyle = gradient;
		au.fillRect(x, top, columnWidth, base + h * 0.01 - top);
	}
	return aurora;
}

export type SceneCLayers = {
	horizon: number;
	sunX: number;
	dark: HTMLCanvasElement;
	face: HTMLCanvasElement;
	rim: HTMLCanvasElement;
	objects: HTMLCanvasElement;
	objectsKey: string;
	bandTop: number;
	bandBottom: number;
	midBerg: BergBox;
	bigBerg: BergBox;
	glitter: HTMLCanvasElement;
	ripples: HTMLCanvasElement;
	floatsDark: HTMLCanvasElement;
	floatsFace: HTMLCanvasElement;
	floatsRim: HTMLCanvasElement;
	floatTop: number;
	aurora: HTMLCanvasElement;
};

/** sunX: 해 쪽 빛 · 물빛 길의 화면 x(px, 해의 계산 방위로 정한다) */
export function buildSceneC(view: View, sunX: number): SceneCLayers {
	const { w, h, s } = view;
	const horizon = h * DAWN_HORIZON;
	const scenery = sceneryPainter(view, horizon);
	const dark = layer(w, h);
	const face = layer(w, h);
	const rim = layer(w, h);
	scenery(context2d(dark), 'dark');
	const { midBerg, bigBerg } = scenery(context2d(face), 'face');
	scenery(context2d(rim), 'rim');
	return {
		horizon,
		sunX,
		dark,
		face,
		rim,
		objects: layer(w, h),
		objectsKey: '',
		bandTop: Math.max(0, Math.floor(horizon - h * 0.19 * 1.1 - 4 * s)),
		bandBottom: Math.ceil(horizon + 4),
		midBerg,
		bigBerg,
		...buildSeaLayers(view, horizon, sunX),
		...buildFloats(view),
		floatTop: Math.floor(h * 0.75),
		aurora: buildAurora(view)
	};
}
