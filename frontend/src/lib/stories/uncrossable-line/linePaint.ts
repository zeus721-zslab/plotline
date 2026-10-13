// 넘을 수 없는 선 그리기 바탕(시제품 flow.src.html 상수 · 수학 · 스프라이트 · 빛 글자 · 먼지 · 빛 · 리본 · 레이저 · 물통 :92-660, 공용 :2241-2402).
// 그리기 값은 시제품 그대로다(D-44). 장면 파일(chapters/ch1~ch9)은 이 모듈의 그리기 상태(ctx · W · H · dpr · G · REDUCED)를 그대로 읽는다:
// 상태는 렌더러(lineRenderer.ts)만 bind/set 함수로 바꾸고, ES 모듈 export 바인딩이라 장면 파일에서 늘 최신 값이 보인다(한 화면에 렌더러 하나).
import type { GateImage, Geometry } from './lineLayers.ts';

export type Rgb = readonly number[];
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Palette = { core: string; glow: string };
/** 캔버스 점수 숫자 중 문구 대조로 숨길 것 */
export type HiddenMarks = { score75: boolean; score84: boolean; score85: boolean };

// ───────── 그리기 상태(렌더러가 설정) ─────────
export let ctx: CanvasRenderingContext2D;
export let W = 0;
export let H = 0;
export let dpr = 1;
export let G: Geometry;
// 동작 줄이기 · 저사양 정지 그림: 시간 의존 움직임을 고정값으로 둔다(시제품 REDUCED 분기)
export let REDUCED = false;
export let MARKS: HiddenMarks = { score75: false, score84: false, score85: false };

export function bindContext(context: CanvasRenderingContext2D): void {
	ctx = context;
}

export function setViewport(width: number, height: number, ratio: number): void {
	W = width;
	H = height;
	dpr = ratio;
}

export function setGeometry(geometry: Geometry): void {
	G = geometry;
}

export function setFrameMode(reduced: boolean, marks: HiddenMarks): void {
	REDUCED = reduced;
	MARKS = marks;
}

/** 오프스크린 캐시 키의 크기 부분(W×H×DPR) */
export function sizeKey(): string {
	return `${W}x${H}x${dpr}`;
}

// ───────── 상수 ─────────
export const FONT_STACK =
	'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
const TEXT_CACHE_LIMIT = 48;
// 이 값 이하의 불투명도 · 세기는 그리지 않는다
const MIN_ALPHA = 0.003;

export const COLOR_A: Rgb = [205, 255, 140]; // 칼슘 연쇄 방출의 551nm(초록빛 노랑) 광자
export const COLOR_B: Rgb = [172, 138, 255]; // 같은 방출의 423nm(보라) 광자
export const WARM: Rgb = [255, 236, 214];
export const WHITE: Rgb = [255, 255, 255];
export const RED: Rgb = [255, 44, 30];
export const SPECTRUM: Rgb[] = [
	[255, 46, 46],
	[255, 140, 36],
	[255, 228, 50],
	[70, 255, 110],
	[50, 220, 255],
	[70, 100, 255],
	[175, 70, 255]
];

// ───────── 수학 ─────────
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (e0: number, e1: number, v: number): number => {
	const t = clamp01((v - e0) / (e1 - e0));
	return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number): number =>
	t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const hash = (n: number): number => {
	const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
};
export function seeded(seed: number): () => number {
	let state = seed | 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
export const gauss = (random: () => number): number =>
	Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random());
export const rgba = (c: Rgb, a: number | string): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export const mixWhite = (c: Rgb, k: number): Rgb => [
	Math.round(lerp(c[0], 255, k)),
	Math.round(lerp(c[1], 255, k)),
	Math.round(lerp(c[2], 255, k))
];

// ───────── 캔버스 · 스프라이트 ─────────
export function makeCanvas(width: number, height: number): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = Math.max(1, Math.ceil(width));
	c.height = Math.max(1, Math.ceil(height));
	return c;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const context = canvas.getContext('2d');
	if (context === null) throw new Error('2d canvas context is not available');
	return context;
}

const spriteCache = new Map<string, HTMLCanvasElement>();
export function cached(key: string, create: () => HTMLCanvasElement): HTMLCanvasElement {
	let sprite = spriteCache.get(key);
	if (sprite === undefined) {
		sprite = create();
		spriteCache.set(key, sprite);
	}
	return sprite;
}

const SPRITE_SIZE = 128;
export function glowSprite(c: Rgb): HTMLCanvasElement {
	return cached(`glow${c}`, () => {
		const s = makeCanvas(SPRITE_SIZE, SPRITE_SIZE);
		const g = context2d(s);
		const r = SPRITE_SIZE / 2;
		const grad = g.createRadialGradient(r, r, 0, r, r, r);
		// 가우시안에 가까운 감쇠: 중심은 진하고 가장자리는 길게 사라진다
		for (const [o, a] of [
			[0, 1],
			[0.07, 0.72],
			[0.18, 0.36],
			[0.36, 0.13],
			[0.6, 0.04],
			[1, 0]
		])
			grad.addColorStop(o, rgba(c, a));
		g.fillStyle = grad;
		g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
		return s;
	});
}
export function bokehSprite(c: Rgb): HTMLCanvasElement {
	return cached(`bokeh${c}`, () => {
		const s = makeCanvas(SPRITE_SIZE, SPRITE_SIZE);
		const g = context2d(s);
		const r = SPRITE_SIZE / 2;
		const grad = g.createRadialGradient(r, r, 0, r, r, r);
		for (const [o, a] of [
			[0, 0.15],
			[0.68, 0.2],
			[0.86, 0.34],
			[0.93, 0.22],
			[1, 0]
		])
			grad.addColorStop(o, rgba(c, a));
		g.fillStyle = grad;
		g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
		// 초점 밖 원반 가장자리의 색수차: 바깥은 붉게, 안쪽은 푸르게
		g.globalCompositeOperation = 'lighter';
		const ring = (radius: number, width: number, color: Rgb, alpha: number): void => {
			const rg = g.createRadialGradient(r, r, radius - width, r, r, radius + width);
			rg.addColorStop(0, rgba(color, 0));
			rg.addColorStop(0.5, rgba(color, alpha));
			rg.addColorStop(1, rgba(color, 0));
			g.fillStyle = rg;
			g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
		};
		ring(r * 0.95, r * 0.05, [255, 90, 70], 0.16);
		ring(r * 0.8, r * 0.05, [80, 140, 255], 0.12);
		return s;
	});
}
export function dotSprite(c: Rgb): HTMLCanvasElement {
	return cached(`dot${c}`, () => {
		const size = 16;
		const s = makeCanvas(size, size);
		const g = context2d(s);
		const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
		for (const [o, a] of [
			[0, 1],
			[0.25, 0.8],
			[0.5, 0.22],
			[1, 0]
		])
			grad.addColorStop(o, rgba(c, a));
		g.fillStyle = grad;
		g.fillRect(0, 0, size, size);
		return s;
	});
}
export function ringSprite(c: Rgb): HTMLCanvasElement {
	return cached(`ring${c}`, () => {
		const size = 256;
		const s = makeCanvas(size, size);
		const g = context2d(s);
		const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
		for (const [o, a] of [
			[0, 0],
			[0.74, 0],
			[0.9, 0.55],
			[0.95, 0.3],
			[1, 0]
		])
			grad.addColorStop(o, rgba(c, a));
		g.fillStyle = grad;
		g.fillRect(0, 0, size, size);
		return s;
	});
}
export function starSprite(): HTMLCanvasElement {
	return cached('star', () => {
		const size = 96;
		const s = makeCanvas(size, size);
		const g = context2d(s);
		g.globalCompositeOperation = 'lighter';
		const glow = glowSprite(WHITE);
		g.globalAlpha = 0.9;
		g.drawImage(glow, 0, size * 0.47, size, size * 0.06);
		g.drawImage(glow, size * 0.47, 0, size * 0.06, size);
		g.globalAlpha = 1;
		g.drawImage(glow, size * 0.35, size * 0.35, size * 0.3, size * 0.3);
		return s;
	});
}
// 불씨: 식으며 흰색 → 호박색 → 붉은색(7-2 불꽃 · 2-2 전자)
export function emberSprite(c: Rgb): HTMLCanvasElement {
	return cached(`ember${c}`, () => {
		const size = 32;
		const s = makeCanvas(size, size);
		const g = context2d(s);
		const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
		grad.addColorStop(0, 'rgba(255,255,245,1)');
		grad.addColorStop(0.18, rgba(c, 0.95));
		grad.addColorStop(0.45, rgba(c, 0.3));
		grad.addColorStop(1, rgba(c, 0));
		g.fillStyle = grad;
		g.fillRect(0, 0, size, size);
		return s;
	});
}
export function drawSprite(
	img: CanvasImageSource,
	x: number,
	y: number,
	radius: number,
	alpha: number
): void {
	if (alpha <= MIN_ALPHA || radius <= 0) return;
	ctx.globalAlpha = alpha > 1 ? 1 : alpha;
	ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
}
export function strokePoly(
	points: number[],
	width: number,
	style: string | CanvasGradient,
	alpha: number
): void {
	if (alpha <= MIN_ALPHA) return;
	ctx.globalAlpha = alpha > 1 ? 1 : alpha;
	ctx.lineWidth = width;
	ctx.strokeStyle = style;
	ctx.beginPath();
	ctx.moveTo(points[0], points[1]);
	for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
	ctx.stroke();
}
export function roundRectPath(
	g: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	g.beginPath();
	g.moveTo(x + r, y);
	g.arcTo(x + w, y, x + w, y + h, r);
	g.arcTo(x + w, y + h, x, y + h, r);
	g.arcTo(x, y + h, x, y, r);
	g.arcTo(x, y, x + w, y, r);
	g.closePath();
}

// ───────── 빛 글자(숫자) ─────────
type TextSprite = { canvas: HTMLCanvasElement; w: number; h: number };
const textCache = new Map<string, TextSprite>();
export function clearTextCache(): void {
	textCache.clear();
}
export function glowText(
	text: string,
	size: number,
	core: string,
	glow: string,
	scale: number
): TextSprite {
	const key = `${text}|${size}|${core}|${glow}|${scale}`;
	const hit = textCache.get(key);
	if (hit !== undefined) {
		textCache.delete(key);
		textCache.set(key, hit);
		return hit;
	}
	const font = `300 ${size}px ${FONT_STACK}`;
	ctx.font = font;
	const pad = size * 0.7;
	const w = ctx.measureText(text).width + pad * 2;
	const h = size * 1.3 + pad * 2;
	const c = makeCanvas(w * scale, h * scale);
	const g = context2d(c);
	g.scale(scale, scale);
	g.font = font;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	// shadowBlur 는 변환을 따르지 않으므로 배율을 직접 곱한다
	g.shadowColor = glow;
	g.shadowBlur = size * 0.5 * scale;
	g.fillStyle = glow;
	g.globalAlpha = 0.55;
	g.fillText(text, w / 2, h / 2);
	g.shadowBlur = size * 0.1 * scale;
	g.globalAlpha = 1;
	g.fillStyle = core;
	g.fillText(text, w / 2, h / 2);
	g.shadowBlur = 0;
	g.fillText(text, w / 2, h / 2);
	const entry = { canvas: c, w, h };
	textCache.set(key, entry);
	if (textCache.size > TEXT_CACHE_LIMIT) {
		const oldest = textCache.keys().next();
		if (oldest.done !== true) textCache.delete(oldest.value);
	}
	return entry;
}
export const PALETTE_GOLD: Palette = { core: 'rgb(255,240,218)', glow: 'rgba(255,170,90,0.95)' };
export const PALETTE_RED: Palette = { core: 'rgb(255,226,218)', glow: 'rgba(255,50,34,0.95)' };
export const PALETTE_GREEN: Palette = { core: 'rgb(228,255,236)', glow: 'rgba(80,255,150,0.9)' };
const GLOW_TEXT_RED = { core: 'rgb(255,60,48)', glow: 'rgba(255,40,30,0.7)' };
const GLOW_TEXT_BLUE = { core: 'rgb(80,120,255)', glow: 'rgba(60,90,255,0.7)' };
/** 빛 글자 세 장(색수차 빨강 · 파랑 + 본 글자)을 미리 만든다(4장 미리 그리기) */
export function warmGlowText(text: string, size: number, palette: Palette, scale: number): void {
	glowText(text, size, GLOW_TEXT_RED.core, GLOW_TEXT_RED.glow, scale);
	glowText(text, size, GLOW_TEXT_BLUE.core, GLOW_TEXT_BLUE.glow, scale);
	glowText(text, size, palette.core, palette.glow, scale);
}
export function drawGlowText(
	text: string,
	x: number,
	y: number,
	size: number,
	palette: Palette,
	alpha: number,
	scale?: number
): void {
	if (alpha <= MIN_ALPHA) return;
	const s = scale === undefined || scale === 0 ? dpr : scale;
	const shift = size * 0.022;
	const red = glowText(text, size, GLOW_TEXT_RED.core, GLOW_TEXT_RED.glow, s);
	const blue = glowText(text, size, GLOW_TEXT_BLUE.core, GLOW_TEXT_BLUE.glow, s);
	const main = glowText(text, size, palette.core, palette.glow, s);
	ctx.globalAlpha = Math.min(1, alpha * 0.3);
	ctx.drawImage(red.canvas, x - red.w / 2 - shift, y - red.h / 2, red.w, red.h);
	ctx.drawImage(blue.canvas, x - blue.w / 2 + shift, y - blue.h / 2, blue.w, blue.h);
	ctx.globalAlpha = Math.min(1, alpha);
	ctx.drawImage(main.canvas, x - main.w / 2, y - main.h / 2, main.w, main.h);
}

// ───────── 먼지(보케) 3층 ─────────
type DustKind = 'dot' | 'soft' | 'bokeh';
type DustLayer = {
	count: number;
	rMin: number;
	rMax: number;
	depth: number;
	kind: DustKind;
	aMin: number;
	aMax: number;
};
const DUST_LAYERS: DustLayer[] = [
	{ count: 1500, rMin: 0.5, rMax: 1.5, depth: 0.04, kind: 'dot', aMin: 0.25, aMax: 0.85 },
	{ count: 300, rMin: 2.2, rMax: 5.5, depth: 0.1, kind: 'soft', aMin: 0.18, aMax: 0.55 },
	{ count: 34, rMin: 16, rMax: 60, depth: 0.26, kind: 'bokeh', aMin: 0.16, aMax: 0.42 }
];
const DUST_SPAN = 1.3; // 시차로 흘러도 끊기지 않도록 화면 높이의 1.3배 띠에 뿌린다
type Dust = DustLayer & {
	x: Float32Array;
	y: Float32Array;
	r: Float32Array;
	a: Float32Array;
	vx: Float32Array;
	vy: Float32Array;
	freq: Float32Array;
	phase: Float32Array;
	tint: Uint8Array;
};
const dust: Dust[] = DUST_LAYERS.map((layer, li) => {
	const random = seeded(101 + li * 17);
	const n = layer.count;
	const d: Dust = {
		...layer,
		x: new Float32Array(n),
		y: new Float32Array(n),
		r: new Float32Array(n),
		a: new Float32Array(n),
		vx: new Float32Array(n),
		vy: new Float32Array(n),
		freq: new Float32Array(n),
		phase: new Float32Array(n),
		tint: new Uint8Array(n)
	};
	for (let i = 0; i < n; i++) {
		d.x[i] = random();
		d.y[i] = random();
		d.r[i] = lerp(layer.rMin, layer.rMax, Math.pow(random(), 1.6));
		d.a[i] = lerp(layer.aMin, layer.aMax, random());
		d.vx[i] = (random() - 0.5) * 0.12;
		d.vy[i] = (random() - 0.5) * 0.08 - 0.02;
		d.freq[i] = 1.5 + random() * 4;
		d.phase[i] = random() * Math.PI * 2;
		d.tint[i] = Math.floor(random() * 3);
	}
	return d;
});
type Tint = { dot: Rgb; soft: Rgb; bokeh: Rgb[] };
const TINTS = {
	warm: {
		dot: [255, 236, 214],
		soft: [255, 214, 172],
		bokeh: [
			[255, 210, 160],
			[176, 196, 255],
			[255, 172, 140]
		]
	},
	lab: {
		dot: [255, 222, 190],
		soft: [255, 196, 150],
		bokeh: [
			[255, 190, 130],
			[150, 180, 220],
			[255, 160, 120]
		]
	},
	water: {
		dot: [190, 240, 255],
		soft: [140, 222, 255],
		bokeh: [
			[120, 210, 255],
			[160, 255, 228],
			[200, 220, 255]
		]
	},
	amber: {
		dot: [255, 226, 180],
		soft: [255, 196, 120],
		bokeh: [
			[255, 196, 120],
			[255, 160, 90],
			[200, 180, 150]
		]
	},
	cool: {
		dot: [210, 225, 255],
		soft: [160, 190, 255],
		bokeh: [
			[140, 170, 255],
			[190, 160, 255],
			[150, 220, 255]
		]
	},
	chalk: {
		dot: [225, 245, 232],
		soft: [190, 235, 210],
		bokeh: [
			[170, 230, 200],
			[230, 240, 220],
			[150, 200, 190]
		]
	}
} satisfies Record<string, Tint>;
export type TintName = keyof typeof TINTS;
export type DustLight = { x: number; y: number; I: number; R2: number };
export type DustOptions = {
	tint: TintName;
	vis: number;
	drift: number;
	scroll: number;
	lights: DustLight[];
	laser: { y: number; tip: number; I: number; w2: number } | null;
	glint: number;
	t: number;
	ambient: number;
};
export function drawDust(o: DustOptions, layerIndex: number): void {
	if (o.vis <= MIN_ALPHA) return;
	const L = dust[layerIndex];
	const tint: Tint = TINTS[o.tint];
	const span = H * DUST_SPAN;
	const offset = -o.scroll * L.depth;
	const scale = G.sizeScale;
	const sprites =
		L.kind === 'bokeh'
			? tint.bokeh.map(bokehSprite)
			: [L.kind === 'dot' ? dotSprite(tint.dot) : glowSprite(tint.soft)];
	const redGlow = glowSprite(RED);
	const star = starSprite();
	const lights = o.lights;
	for (let i = 0; i < L.count; i++) {
		const x = (L.x[i] + L.vx[i] * o.drift) * W;
		let y = ((L.y[i] + L.vy[i] * o.drift) * span + offset) % span;
		if (y < 0) y += span;
		y -= H * 0.15;
		const r = L.r[i] * scale;
		if (x < -r * 2 || x > W + r * 2 || y < -r * 2 || y > H + r * 2) continue;
		let b = o.ambient;
		for (let k = 0; k < lights.length; k++) {
			const l = lights[k];
			if (l.I <= 0) continue;
			const dx = x - l.x;
			const dy = y - l.y;
			b += (l.I * l.R2) / (l.R2 + dx * dx + dy * dy);
		}
		if (b > 2.4) b = 2.4;
		const alpha = o.vis * L.a[i] * b;
		const sprite = sprites.length > 1 ? sprites[L.tint[i]] : sprites[0];
		const radius = L.kind === 'dot' ? r * 2.6 : L.kind === 'soft' ? r * 2.2 : r;
		drawSprite(sprite, x, y, radius, alpha);
		if (o.laser !== null && x < o.laser.tip) {
			const d = y - o.laser.y;
			const red = o.laser.I * Math.exp((-d * d) / o.laser.w2);
			if (red > 0.02)
				drawSprite(
					redGlow,
					x,
					y,
					radius * 1.8 + 3,
					red * o.vis * (L.kind === 'bokeh' ? 0.35 : 0.95)
				);
		}
		if (o.glint > 0 && L.kind !== 'bokeh') {
			const f = Math.sin(o.t * L.freq[i] + L.phase[i]);
			if (f > 0.97 && b > o.ambient * 1.6)
				drawSprite(
					star,
					x,
					y,
					7 + L.r[i] * 5,
					((f - 0.97) / 0.03) * o.glint * o.vis * Math.min(1, b * 0.6)
				);
		}
	}
}
export function dustLayers(o: DustOptions, from: number, to: number): void {
	for (let i = from; i <= to; i++) drawDust(o, i);
}

// ───────── 빛 · 리본 · 레이저 ─────────
export type Motion = { angle: number; len: number };
export function drawLight(
	x: number,
	y: number,
	I: number,
	color: Rgb,
	motion: Motion | null
): void {
	if (I <= MIN_ALPHA) return;
	const m = G.m;
	const glow = glowSprite(color);
	if (motion !== null && motion.len > 1) {
		// 날아가는 동안의 움직임 번짐: 진행 반대 방향으로 늘린 빛
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(motion.angle);
		ctx.globalAlpha = Math.min(1, 0.55 * I);
		ctx.drawImage(glow, -motion.len, -m * 0.018, motion.len * 1.15, m * 0.036);
		ctx.restore();
	}
	drawSprite(glow, x, y, m * 0.6 * Math.sqrt(I), 0.15 * I);
	drawSprite(glow, x, y, m * 0.17, 0.5 * I);
	// 렌즈 색수차: 화면 중심 기준 바깥쪽에 빨강, 안쪽에 파랑
	const dx = x - W / 2;
	const dy = y - H / 2;
	const len = Math.hypot(dx, dy) || 1;
	const ox = (dx / len) * 3.2 * I;
	const oy = (dy / len) * 3.2 * I;
	drawSprite(glowSprite([255, 70, 50]), x + ox, y + oy, m * 0.075, 0.45 * I);
	drawSprite(glowSprite([70, 120, 255]), x - ox, y - oy, m * 0.075, 0.45 * I);
	drawSprite(glowSprite(WARM), x, y, m * 0.04, 0.9 * Math.min(1.2, I));
	drawSprite(glowSprite(WHITE), x, y, 6, Math.min(1, I * 1.2));
	// 아나모픽 줄무늬 플레어
	const streak = W * 0.5 * Math.min(1.3, I);
	ctx.globalAlpha = Math.min(1, 0.22 * I);
	ctx.drawImage(glowSprite([150, 180, 255]), x - streak, y - 2.5, streak * 2, 5);
}
// 4-1 리본 그라디언트 캐시(끝점이 고정된 리본만, 키에 W×H×DPR 포함). 크기가 바뀌면 렌더러가 비운다
const ribbonGradientCache = new Map<string, CanvasGradient>();
export function clearRibbonCache(): void {
	ribbonGradientCache.clear();
}
function createRibbonGradient(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	color: Rgb,
	alpha: number
): CanvasGradient {
	const g = ctx.createLinearGradient(x0, y0, x1, y1);
	g.addColorStop(0, rgba(color, 0));
	g.addColorStop(0.35, rgba(color, alpha * 0.22));
	g.addColorStop(0.85, rgba(color, alpha * 0.8));
	g.addColorStop(1, rgba(color, alpha));
	return g;
}
function ribbonGradient(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	color: Rgb,
	alpha: number,
	cacheKey: string | null
): CanvasGradient {
	if (cacheKey === null) return createRibbonGradient(x0, y0, x1, y1, color, alpha);
	const key = `${cacheKey}|${sizeKey()}|${color}|${alpha}`;
	let gradient = ribbonGradientCache.get(key);
	if (gradient === undefined) {
		gradient = createRibbonGradient(x0, y0, x1, y1, color, alpha);
		ribbonGradientCache.set(key, gradient);
	}
	return gradient;
}
const RIBBON_SEGMENTS = 48;
const SPARK_COUNT = 90;
const sparks = (() => {
	const random = seeded(7);
	const u = new Float32Array(SPARK_COUNT);
	const off = new Float32Array(SPARK_COUNT);
	const size = new Float32Array(SPARK_COUNT);
	for (let i = 0; i < SPARK_COUNT; i++) {
		u[i] = Math.sqrt(random());
		off[i] = gauss(random);
		size[i] = 0.6 + random() * 1.4;
	}
	return { u, off, size };
})();
/** cacheKey: 끝점이 고정된 리본(4-1)이면 그라디언트를 캐시할 이름, 아니면 null */
export function drawRibbon(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	I: number,
	color: Rgb,
	freeze: number,
	seed: number,
	cacheKey: string | null = null
): void {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const len = Math.hypot(dx, dy);
	if (len < 2 || I <= MIN_ALPHA) return;
	const nx = -dy / len;
	const ny = dx / len;
	const ripple = freeze * 2.2;
	const path = (offset: number): number[] => {
		const pts: number[] = [];
		for (let i = 0; i <= RIBBON_SEGMENTS; i++) {
			const u = i / RIBBON_SEGMENTS;
			const wave = ripple * Math.sin(u * len * 0.045 + seed) * u + offset;
			pts.push(x0 + dx * u + nx * wave, y0 + dy * u + ny * wave);
		}
		return pts;
	};
	ctx.lineCap = 'round';
	const center = path(0);
	strokePoly(center, G.m * 0.07, ribbonGradient(x0, y0, x1, y1, color, 1, cacheKey), 0.07 * I);
	strokePoly(center, 9, ribbonGradient(x0, y0, x1, y1, color, 1, cacheKey), 0.2 * I);
	// 얼어붙은 리본 가장자리의 무지개 분산
	if (freeze > 0.01) {
		const spread = 1.3 * freeze;
		for (let k = 0; k < SPECTRUM.length; k++) {
			const offset = (k - 3) * spread;
			strokePoly(
				path(offset),
				2.2,
				ribbonGradient(x0, y0, x1, y1, SPECTRUM[k], 1, cacheKey),
				0.5 * I * freeze
			);
		}
	}
	const core = [lerp(color[0], 255, 0.6), lerp(color[1], 255, 0.6), lerp(color[2], 255, 0.6)];
	strokePoly(center, 1.6, ribbonGradient(x0, y0, x1, y1, core, 1, cacheKey), 0.95 * Math.min(1, I));
	// 리본 결을 따라 붙은 빛 알갱이
	for (let i = 0; i < SPARK_COUNT; i++) {
		const u = sparks.u[i];
		const wobble = sparks.off[i] * (2 + 6 * freeze);
		const x = x0 + dx * u + nx * wobble;
		const y = y0 + dy * u + ny * wobble;
		const c = freeze > 0.3 ? SPECTRUM[(i + seed * 3) % SPECTRUM.length] : color;
		drawSprite(dotSprite(c), x, y, sparks.size[i] * 2.4, I * Math.pow(u, 1.5) * 0.7);
	}
}
export function laserPasses(points: number[], I: number): void {
	ctx.lineCap = 'round';
	strokePoly(points, G.m * 0.1, rgba(RED, 1), 0.03 * I);
	strokePoly(points, 24, rgba(RED, 1), 0.06 * I);
	strokePoly(points, 9, rgba(RED, 1), 0.18 * I);
	strokePoly(points, 3.2, 'rgb(255,72,52)', 0.6 * I);
	strokePoly(points, 1.3, 'rgb(255,218,208)', 0.95 * I);
}
export type Bend = ((x: number) => number) | null;
export function drawLaser(y: number, tip: number, I: number, bend: Bend): void {
	if (I <= MIN_ALPHA) return;
	const x0 = -0.05 * W;
	const pts: number[] = [];
	const step = 8;
	for (let x = x0; x < tip; x += step) pts.push(x, bend !== null ? y + bend(x) : y);
	pts.push(tip, bend !== null ? y + bend(tip) : y);
	if (pts.length < 4) return;
	// 공기 중 산란으로 보이는 붉은 띠
	ctx.globalAlpha = Math.min(1, 0.1 * I);
	ctx.drawImage(glowSprite(RED), x0, y - G.m * 0.08, tip - x0, G.m * 0.16);
	laserPasses(pts, I);
	if (tip < W * 1.02) {
		const ty = bend !== null ? y + bend(tip) : y;
		drawSprite(glowSprite(RED), tip, ty, G.m * 0.12, 0.7 * I);
		drawSprite(glowSprite(WHITE), tip, ty, 7, I);
	}
}
export function drawCrackedLaser(y: number, I: number, crack: number): void {
	const xs = [-0.05 * W, ...G.cracks.map((c) => c.x), 1.05 * W];
	const gap = crack * 7;
	for (let j = 0; j < xs.length - 1; j++) {
		const shift = (j % 2 === 0 ? -1 : 1) * crack * 3.2;
		const tilt = (hash(j + 3) - 0.5) * crack * 5;
		const a = xs[j] + (j === 0 ? 0 : gap / 2);
		const b = xs[j + 1] - (j === xs.length - 2 ? 0 : gap / 2);
		laserPasses([a, y + shift - tilt, (a + b) / 2, y + shift, b, y + shift + tilt], I);
	}
	if (crack <= MIN_ALPHA) return;
	const white = glowSprite([255, 236, 220]);
	const red = glowSprite(RED);
	ctx.lineCap = 'round';
	for (const c of G.cracks) {
		drawSprite(red, c.x, y, 14 + crack * 26, 0.8 * crack * I);
		drawSprite(white, c.x, y, 6 + crack * 8, crack * I);
		for (const branch of c.branches) {
			const count = Math.max(2, Math.floor((branch.length / 2) * crack)) * 2;
			const pts: number[] = [];
			for (let i = 0; i < count && i < branch.length; i += 2)
				pts.push(c.x + branch[i], y + branch[i + 1]);
			if (pts.length >= 4) {
				strokePoly(pts, 5, rgba(RED, 1), 0.12 * crack * I);
				strokePoly(pts, 1, 'rgb(255,214,200)', 0.42 * crack * I);
			}
		}
	}
}
export function drawTank(rect: Rect, alpha: number, t: number, interior: boolean): void {
	if (alpha <= MIN_ALPHA) return;
	const x = rect.x - rect.w / 2;
	const y = rect.y - rect.h / 2;
	const r = Math.min(10, rect.w * 0.08);
	ctx.save();
	if (interior) {
		ctx.globalCompositeOperation = 'source-over';
		roundRectPath(ctx, x, y, rect.w, rect.h, r);
		ctx.globalAlpha = 0.5 * alpha;
		ctx.fillStyle = 'rgb(10,26,32)';
		ctx.fill();
		ctx.clip();
		ctx.globalCompositeOperation = 'lighter';
		// 아주 약한 물속 일렁임: 선이 아니라 흐릿한 빛 얼룩이 천천히 떠돈다
		const blob = glowSprite([110, 205, 235]);
		for (let j = 0; j < 6; j++) {
			const bx = x + rect.w * (0.5 + 0.38 * Math.sin(t * (0.5 + j * 0.13) + j * 2.1));
			const by = y + rect.h * (0.55 + 0.3 * Math.cos(t * (0.4 + j * 0.11) + j * 1.3));
			ctx.globalAlpha = 0.16 * alpha;
			ctx.drawImage(blob, bx - rect.w * 0.35, by - rect.h * 0.08, rect.w * 0.7, rect.h * 0.16);
		}
		ctx.restore();
		ctx.save();
	}
	ctx.globalCompositeOperation = 'lighter';
	roundRectPath(ctx, x, y, rect.w, rect.h, r);
	ctx.lineWidth = 8;
	ctx.strokeStyle = 'rgb(150,200,225)';
	ctx.globalAlpha = 0.025 * alpha;
	ctx.stroke();
	ctx.lineWidth = 1;
	ctx.globalAlpha = 0.08 * alpha;
	ctx.stroke();
	// 수면의 희미한 빛과 유리 반사
	ctx.globalAlpha = 0.22 * alpha;
	ctx.drawImage(glowSprite([190, 235, 250]), x, y + rect.h * 0.18 - 3, rect.w, 6);
	ctx.globalAlpha = 0.1 * alpha;
	ctx.drawImage(
		glowSprite([200, 230, 255]),
		x + rect.w * 0.1,
		y + rect.h * 0.1,
		rect.w * 0.12,
		rect.h * 0.8
	);
	drawSprite(glowSprite([120, 200, 230]), rect.x, rect.y, rect.w * 0.9, 0.08 * alpha);
	ctx.restore();
}

// ───────── 창살 문 · 쌍둥이 빛(1장 · 6장 · 9장 등 공용 모티프) ─────────
export const PASS_COLOR: Rgb = [200, 255, 215];
export const BLOCK_COLOR: Rgb = [255, 92, 60];
export const REDUCED_DEMO_PHASE = 0.62; // 동작 줄이기: 결과가 보이는 순간에 멈춘다
export function drawBead(from: Point, to: Point, k: number, I: number, color: Rgb): void {
	if (I <= MIN_ALPHA) return;
	const x = lerp(from.x, to.x, k);
	const y = lerp(from.y, to.y, k);
	drawSprite(glowSprite(color), x, y, G.m * 0.05, 0.55 * I);
	drawSprite(glowSprite(WHITE), x, y, 3.5, I);
}
export function drawPass(from: Point, gate: Point, k: number, I: number, color: Rgb): void {
	// 문을 지난 빛: 더 밝아져 같은 방향으로 계속 간다
	if (I <= MIN_ALPHA) return;
	const dx = gate.x - from.x;
	const dy = gate.y - from.y;
	const len = Math.hypot(dx, dy) || 1;
	const reach = G.m * 0.2 * easeOutCubic(k);
	const x = gate.x + (dx / len) * reach;
	const y = gate.y + (dy / len) * reach;
	const fade = I * (1 - smooth(0.6, 1, k));
	ctx.lineCap = 'round';
	strokePoly([gate.x, gate.y, x, y], 2, rgba(color, 1), 0.5 * fade);
	drawSprite(glowSprite(color), x, y, G.m * 0.09, 0.6 * fade);
	drawSprite(glowSprite(WHITE), x, y, 5, fade);
	drawSprite(glowSprite(PASS_COLOR), gate.x, gate.y, G.gateW * 0.9, 0.35 * I * Math.exp(-k * 5));
}
export function drawBlock(gate: Point, k: number, I: number, seed: number): void {
	// 막힌 빛: 문에 부딪혀 작은 알갱이로 흩어진다
	if (I <= MIN_ALPHA) return;
	const fade = I * (1 - k);
	drawSprite(glowSprite(BLOCK_COLOR), gate.x, gate.y, G.gateW * 0.7, 0.45 * I * Math.exp(-k * 4));
	drawSprite(glowSprite(WHITE), gate.x, gate.y, 4, I * Math.exp(-k * 8));
	const dot = dotSprite([255, 190, 150]);
	const spread = G.m * 0.08 * easeOutCubic(k);
	for (let i = 0; i < 18; i++) {
		const angle = hash(seed + i * 1.7) * Math.PI * 2;
		const speed = 0.35 + hash(seed + i * 2.3 + 0.5) * 0.65;
		const x = gate.x + Math.cos(angle) * spread * speed;
		const y = gate.y + Math.sin(angle) * spread * speed + k * k * G.m * 0.03;
		drawSprite(dot, x, y, 2.4 + hash(seed + i) * 1.6, fade * 0.9);
	}
}
export function drawGate(
	pos: Point,
	image: GateImage,
	I: number,
	rotation?: number,
	scale?: number
): void {
	if (I <= MIN_ALPHA) return;
	const k = scale === undefined || scale === 0 ? 1 : scale;
	drawSprite(glowSprite([170, 200, 255]), pos.x, pos.y, image.gw * 0.9 * k, 0.1 * I);
	ctx.globalAlpha = Math.min(1, I);
	if (rotation !== undefined && rotation !== 0) {
		ctx.save();
		ctx.translate(pos.x, pos.y);
		ctx.rotate(rotation);
		ctx.drawImage(image.canvas, (-image.w / 2) * k, (-image.h / 2) * k, image.w * k, image.h * k);
		ctx.restore();
		return;
	}
	ctx.drawImage(
		image.canvas,
		pos.x - (image.w / 2) * k,
		pos.y - (image.h / 2) * k,
		image.w * k,
		image.h * k
	);
}

// ───────── 공용(2~6장 · 9장) ─────────
export function paintLayer(c: CanvasImageSource, alpha: number): void {
	if (alpha <= MIN_ALPHA) return;
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = alpha > 1 ? 1 : alpha;
	ctx.drawImage(c, 0, 0, W, H);
}
export type Piece = { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number };
export function paintPiece(p: Piece, alpha: number, dx = 0, dy = 0): void {
	if (alpha <= MIN_ALPHA) return;
	ctx.globalAlpha = alpha > 1 ? 1 : alpha;
	ctx.drawImage(p.canvas, p.x + dx, p.y + dy, p.w, p.h);
}
export function darken(alpha: number): void {
	if (alpha <= MIN_ALPHA) return;
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = alpha > 1 ? 1 : alpha;
	ctx.fillStyle = '#000';
	ctx.fillRect(-10, -10, W + 20, H + 20);
	ctx.globalCompositeOperation = 'lighter';
}
export function vignetteOn(
	g: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	strength: number
): void {
	const v = g.createRadialGradient(cx, cy, G.m * 0.25, cx, cy, G.diag * 0.66);
	v.addColorStop(0, 'rgba(0,0,0,0)');
	v.addColorStop(1, `rgba(0,0,0,${strength})`);
	g.fillStyle = v;
	g.fillRect(0, 0, W, H);
}
// 빛으로 된 선: 넓은 번짐 + 중간 번짐 + 밝은 심(얇은 도식 선이 아니라 발광체로 보이게)
export function glowLine(points: number[], width: number, color: Rgb, I: number): void {
	if (I <= MIN_ALPHA || points.length < 4) return;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	strokePoly(points, width * 6, rgba(color, 1), 0.06 * I);
	strokePoly(points, width * 2.4, rgba(color, 1), 0.2 * I);
	strokePoly(points, width, rgba(mixWhite(color, 0.55), 1), 0.9 * I);
}
export function circlePoints(
	cx: number,
	cy: number,
	r: number,
	n: number,
	a0 = 0,
	a1 = Math.PI * 2
): number[] {
	const pts: number[] = [];
	for (let i = 0; i <= n; i++) {
		const a = lerp(a0, a1, i / n);
		pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
	}
	return pts;
}
// 선의 앞쪽 u(0~1)만큼만 남긴다. head = 그리고 있는 끝
export function partialPath(points: number[], u: number): { pts: number[]; head: number[] } {
	if (u >= 1) return { pts: points, head: [points[points.length - 2], points[points.length - 1]] };
	const seg: number[] = [];
	let total = 0;
	for (let i = 2; i < points.length; i += 2) {
		const d = Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
		seg.push(d);
		total += d;
	}
	let remain = total * clamp01(u);
	const out = [points[0], points[1]];
	for (let j = 0; j < seg.length; j++) {
		const i = (j + 1) * 2;
		if (remain >= seg[j]) {
			out.push(points[i], points[i + 1]);
			remain -= seg[j];
			continue;
		}
		const f = seg[j] > 0 ? remain / seg[j] : 0;
		out.push(lerp(points[i - 2], points[i], f), lerp(points[i - 1], points[i + 1], f));
		break;
	}
	return { pts: out, head: [out[out.length - 2], out[out.length - 1]] };
}
export function drawLabel(
	text: string,
	x: number,
	y: number,
	size: number,
	color: string,
	alpha: number,
	align: CanvasTextAlign = 'center'
): void {
	if (alpha <= MIN_ALPHA) return;
	ctx.globalAlpha = Math.min(1, alpha);
	ctx.font = `${Math.round(size)}px ${FONT_STACK}`;
	ctx.textAlign = align;
	ctx.textBaseline = 'middle';
	ctx.fillStyle = color;
	ctx.fillText(text, x, y);
}
// 쌍둥이 빛(전 편을 꿰는 모티프): 2~8장 내내 화면 양 가장자리에서 희미하게 숨 쉰다. boost 로 다시 밝아진다
export function drawTwinEdges(t: number, boost: number, alpha = 1): void {
	if (alpha <= MIN_ALPHA) return;
	ctx.globalCompositeOperation = 'lighter';
	const breath = REDUCED ? 0.85 : 0.72 + 0.28 * Math.sin(t * 1.15);
	const I = (0.3 + 0.95 * boost) * breath * alpha;
	const spots: [number, number, Rgb][] = [
		[W * 0.012, H * (G.portrait ? 0.5 : 0.56), COLOR_A],
		[W * 0.988, H * (G.portrait ? 0.26 : 0.3), COLOR_B]
	];
	for (const [x, y, c] of spots) {
		drawSprite(glowSprite(c), x, y, G.m * (0.3 + 0.32 * boost), 0.32 * I);
		drawSprite(glowSprite(c), x, y, G.m * 0.07, 0.6 * I);
		drawSprite(glowSprite(WHITE), x, y, 2.5 + 3.5 * boost, Math.min(1, 0.9 * I));
	}
}
/** 비트 하나의 그림: p = 비트 진행값, I = 세기(앞 비트와 겹쳐 사라지는 동안 0~1), local = 장 스크롤 거리 */
export type BeatPainter = (p: number, t: number, I: number, local: number) => void;
// 한 장 안의 비트들: 다음 비트 첫 10% 동안 앞 비트의 끝 모습이 겹쳐 사라진다
export function drawBeats(fns: BeatPainter[], s: number, t: number, local: number): void {
	const b = Math.max(0, Math.min(fns.length - 1, Math.floor(s)));
	const p = Math.min(1, s - b);
	const cross = smooth(0, 0.1, p);
	if (b > 0 && cross < 1) fns[b - 1](1, t, 1 - cross, local);
	fns[b](p, t, b > 0 ? cross : 1, local);
}
// 덮어 둔 동전: 엎어 둔 잔 아래로 금빛 가장자리만 새어 나온다(2-4 · 9-3)
export function drawCoveredCoin(x: number, y: number, size: number, I: number): void {
	if (I <= MIN_ALPHA) return;
	ctx.globalCompositeOperation = 'lighter';
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(1, 0.3);
	drawSprite(glowSprite([255, 200, 110]), 0, 0, size * 1.7, 0.3 * I);
	ctx.restore();
	const top = y - size * 1.25;
	const w0 = size * 0.72;
	const w1 = size * 1.05;
	const cup = (): void => {
		ctx.beginPath();
		ctx.moveTo(x - w0, top);
		ctx.lineTo(x + w0, top);
		ctx.lineTo(x + w1, y);
		ctx.lineTo(x - w1, y);
		ctx.closePath();
	};
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = Math.min(1, I);
	const fill = ctx.createLinearGradient(x - w1, 0, x + w1, 0);
	fill.addColorStop(0, '#2c1f14');
	fill.addColorStop(0.35, '#0e0a07');
	fill.addColorStop(1, '#050403');
	cup();
	ctx.fillStyle = fill;
	ctx.fill();
	ctx.globalCompositeOperation = 'lighter';
	cup();
	ctx.lineWidth = 1;
	ctx.strokeStyle = 'rgba(255,200,140,0.4)';
	ctx.stroke();
	ctx.globalAlpha = Math.min(1, 0.75 * I);
	ctx.drawImage(glowSprite([255, 210, 130]), x - w1 * 1.15, y - 2.5, w1 * 2.3, 5);
	drawSprite(glowSprite(WHITE), x + w1 * 0.62, y, 2.5, 0.85 * I);
}
