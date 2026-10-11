// 마지막 2시간 40분 배경 렌더러(Canvas 2D 한 장, 시제품 v3 그대로 옮김, D-43).
// 미리 그린 층(titanicLayers.ts)을 장면(titanicScene.ts SceneFrame)에 맞춰 합성한다. 별 위치는 1912년 그 자리의 계산값(skyData.ts).
// animate 면 rAF 로 매 프레임 그리고(물 일렁임 · 보트 흔들림), 아니면(동작 줄이기) 장면이 바뀔 때만 한 번 그린다.
import {
	bodyAt,
	clamp01,
	lerp,
	limitingMagnitude,
	localSiderealDegrees,
	starVector,
	vectorFromAltAz,
	type SkyData,
	type Vector3
} from './skyData.ts';
import {
	buildSceneA,
	buildSceneB,
	buildSceneC,
	buildStarSprites,
	BIG_BERG,
	context2d,
	cssRgb,
	DAWN_HORIZON,
	hexRgb,
	layer,
	MID_BERG,
	mixRgb,
	objectWidthOf,
	RED_STEPS,
	SHIP_A_SHARE,
	SHIP_LENGTH,
	shipLightList,
	shipPath,
	STAR_BUCKETS,
	vgrad,
	type Rgb,
	type SceneALayers,
	type SceneBLayers,
	type SceneCLayers,
	type ShipLight,
	type StarSprite,
	type View
} from './titanicLayers.ts';
import {
	auroraAlpha,
	COVER_FRAME,
	DAWN_END,
	DAWN_FULL_PROGRESS,
	glitterAlpha,
	NIGHT_END,
	NIGHT_START,
	smooth,
	V3_DAWN_START,
	type DawnFrame,
	type NightFrame,
	type SceneFrame,
	type SinkingFrame
} from './titanicScene.ts';

const DEGREES = Math.PI / 180;
// 시안과 같은 상한
const MAX_PIXEL_RATIO = 2;
// 시안의 s = 패널 폭 / 390, 패널 세로 / 가로 = 2
const MOCK_PANEL_WIDTH = 390;
const MOCK_PANEL_ASPECT = 2;
const SLOW_FRAME_MS = 33;
const SOUTH = 180;
// 세로 반시야 tan(별 투영)
const TAN_HALF_FOV = { portrait: 1.2, landscape: 0.75 };
const NIGHT_HORIZON = 0.66;
const SINKING_HORIZON = 0.6;
// 장면 A: 진행도별 뱃머리 위치. 0.45 는 시안 A(뱃머리 0.02w + 0.58L)
const SHIP_A_ENTER = 0.05;
const SHIP_A_CENTER = 0.45;
const SHIP_A_EXIT = 0.8;
const SHIP_A_BOW_AT_CENTER = 0.02 + 0.58 * SHIP_A_SHARE.portrait;
// 고개를 다 들었을 때 수평선 위치(화면 높이 비)
const SKY_LOOK_HORIZON = 1.04;
// 별 개수 · 밝기 기준: 장면 A 시안 구도(진행 0.45)
const REFERENCE_PROGRESS = 0.45;
// 장면 B
const SHIP_B_PIVOT = 196;
const BOAT_BOB_CSS_PIXELS = 1.5;
const BOAT_BOB_SECONDS = 4;
// 장면 C
const DAWN_SKY_EASING = 1.4;
const DAWN_SKY_POSITIONS = [0, 0.4, 0.75, 0.93, 1];
const DAWN_SKY_COLORS = ['#121c2e', '#33465f', '#8e8f8f', '#d9c39d', '#f3dcae'].map(hexRgb);
const NIGHT_SKY_STOPS: Array<[number, Rgb]> = [
	[0, hexRgb('#02040b')],
	[0.55, hexRgb('#06102a')],
	[1, hexRgb('#16244a')]
];
const DAWN_SEA_POSITIONS = [0, 0.18, 1];
const DAWN_SEA_COLORS = ['#8d8574', '#4c5260', '#0e141f'].map(hexRgb);
const NIGHT_SEA: [Rgb, Rgb] = [hexRgb('#0a1430'), hexRgb('#010206')];
// 별
const STAR_FADE_MAGNITUDES = 0.5;
const EXTINCTION_PER_AIRMASS = 0.12;
const DARK_SKY_LIMIT = 6.5;
// [이름, 색 번호] — 금성은 장면 C 에서 따로
const SKY_PLANETS: Array<['jupiter' | 'mars' | 'saturn', number]> = [
	['jupiter', 3],
	['mars', 4],
	['saturn', 1]
];
// 물속 암전(에필로그): 앞 60% 동안 수면이 화면 위로 올라가고, 35% 부터 검게 닫힌다.
const DIVE_RISE_SHARE = 0.6;
const DIVE_DARK_FROM = 0.35;
const UNDERWATER_TOP = 'rgba(16,44,62,1)';
const UNDERWATER_BOTTOM = '#02060c';

type Camera = {
	f: number;
	cx: number;
	cy: number;
	horizonY: number;
	forward: Vector3;
	right: Vector3;
	up: Vector3;
};

type ListedStar = { x: number; y: number; dm: number; tint: number; fade: number };

type Cache = {
	starSprites: StarSprite[][];
	starLayer: HTMLCanvasElement;
	starReflectLayer: HTMLCanvasElement;
	starKey: string;
	starCount: number;
	referenceMagnitudes: number[];
	sceneA: SceneALayers | null;
	sceneB: SceneBLayers | null;
	sceneC: SceneCLayers | null;
	dawnAzimuth: number;
};

export type RendererStats = { draws: number; slowFrames: number };

function tintIndex(colorIndex: number): number {
	if (colorIndex < 0) return 2;
	if (colorIndex < 0.3) return 1;
	if (colorIndex < 0.6) return 0;
	if (colorIndex < 1.0) return 3;
	return 4;
}

function dot(a: Vector3, b: Vector3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** 투시 카메라: 방위 azimuth 를 보고, 수평선이 horizonY 에 오도록 고개를 든다 */
function makeCamera(view: View, azimuth: number, horizonY: number): Camera {
	const cy = view.h / 2;
	const pitch = Math.atan((horizonY - cy) / view.f);
	const a = azimuth * DEGREES;
	return {
		f: view.f,
		cx: view.w / 2,
		cy,
		horizonY,
		forward: [Math.cos(pitch) * Math.sin(a), Math.cos(pitch) * Math.cos(a), Math.sin(pitch)],
		right: [Math.cos(a), -Math.sin(a), 0],
		up: [-Math.sin(pitch) * Math.sin(a), -Math.sin(pitch) * Math.cos(a), Math.cos(pitch)]
	};
}

function project(camera: Camera, vector: Vector3): [number, number] | null {
	const depth = dot(vector, camera.forward);
	if (depth < 0.1) return null;
	return [
		camera.cx + (camera.f * dot(vector, camera.right)) / depth,
		camera.cy - (camera.f * dot(vector, camera.up)) / depth
	];
}

function displayMagnitude(magnitude: number, up: number): number {
	return magnitude + EXTINCTION_PER_AIRMASS * Math.max(0, 1 / (up + 0.025) - 1);
}

function sampleStops(stops: Array<[number, Rgb]>, position: number): Rgb {
	for (let index = 1; index < stops.length; index += 1) {
		if (position <= stops[index][0]) {
			const [p0, c0] = stops[index - 1];
			const [p1, c1] = stops[index];
			return mixRgb(c0, c1, (position - p0) / (p1 - p0));
		}
	}
	return stops[stops.length - 1][1];
}

function nightSea(ctx: CanvasRenderingContext2D, view: View, horizon: number, depth: number): void {
	ctx.fillStyle = vgrad(ctx, horizon, horizon + depth, [
		[0, '#0a1430'],
		[1, '#010206']
	]);
	ctx.fillRect(0, horizon, view.w, view.h - horizon);
}

function horizonLine(ctx: CanvasRenderingContext2D, view: View, horizon: number): void {
	ctx.fillStyle = 'rgba(120,150,210,.35)';
	ctx.fillRect(0, horizon - 0.5 * view.s, view.w, 1 * view.s);
}

// 잔잔한 물: 아주 느린 가로 일렁임
function calmWobble(depth: number, time: number, s: number): number {
	return Math.sin((depth * 0.04) / s + time * 0.5) * (0.3 * s + depth * 0.002);
}

export class TitanicRenderer {
	readonly stats: RendererStats = { draws: 0, slowFrames: 0 };
	#canvas: HTMLCanvasElement;
	#ctx: CanvasRenderingContext2D;
	#sky: SkyData;
	#animate: boolean;
	#lights: ShipLight[] = shipLightList();
	#view: View;
	#cache: Cache;
	#frame: SceneFrame = COVER_FRAME;
	#paused = false;
	#rafId = 0;
	#lastFrameAt = 0;
	#startedAt = performance.now();

	constructor(
		canvas: HTMLCanvasElement,
		ctx: CanvasRenderingContext2D,
		sky: SkyData,
		animate: boolean
	) {
		this.#canvas = canvas;
		this.#ctx = ctx;
		this.#sky = sky;
		this.#animate = animate;
		this.#view = this.#measureView();
		this.#cache = this.#buildCache();
		this.#applySize();
		this.#schedule();
	}

	setFrame(frame: SceneFrame): void {
		this.#frame = frame;
		if (!this.#animate) this.#schedule();
	}

	setPaused(paused: boolean): void {
		if (this.#paused === paused) return;
		this.#paused = paused;
		if (paused) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = 0;
			this.#lastFrameAt = 0;
		} else {
			this.#schedule();
		}
	}

	resize(): void {
		this.#view = this.#measureView();
		this.#cache = this.#buildCache();
		this.#applySize();
		this.#schedule();
	}

	dispose(): void {
		cancelAnimationFrame(this.#rafId);
		this.#rafId = 0;
		this.#paused = true;
	}

	#schedule(): void {
		if (this.#paused || this.#rafId !== 0) return;
		this.#rafId = requestAnimationFrame((now) => this.#tick(now));
	}

	#tick(now: number): void {
		this.#rafId = 0;
		if (this.#paused) return;
		if (this.#animate) {
			if (this.#lastFrameAt > 0 && now - this.#lastFrameAt > SLOW_FRAME_MS) {
				this.stats.slowFrames += 1;
			}
			this.#lastFrameAt = now;
		}
		const time = this.#animate ? (now - this.#startedAt) / 1000 : 0;
		this.#draw(this.#frame, time);
		this.stats.draws += 1;
		this.#canvas.dataset.draws = String(this.stats.draws);
		this.#canvas.dataset.slow = String(this.stats.slowFrames);
		if (this.#animate) this.#schedule();
	}

	#measureView(): View {
		const cssWidth = this.#canvas.clientWidth || window.innerWidth;
		const cssHeight = this.#canvas.clientHeight || window.innerHeight;
		const pr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
		const w = Math.round(cssWidth * pr);
		const h = Math.round(cssHeight * pr);
		const landscape = cssWidth > cssHeight;
		const panelWidth = Math.min(cssWidth, cssHeight / MOCK_PANEL_ASPECT);
		const tanHalf = landscape ? TAN_HALF_FOV.landscape : TAN_HALF_FOV.portrait;
		return { w, h, pr, landscape, s: (pr * panelWidth) / MOCK_PANEL_WIDTH, f: h / 2 / tanHalf };
	}

	#applySize(): void {
		this.#canvas.width = this.#view.w;
		this.#canvas.height = this.#view.h;
	}

	#buildCache(): Cache {
		const view = this.#view;
		const cache: Cache = {
			starSprites: buildStarSprites(view.s),
			starLayer: layer(view.w, view.h),
			starReflectLayer: layer(view.w, view.h),
			starKey: '',
			starCount: 0,
			referenceMagnitudes: [],
			sceneA: null,
			sceneB: null,
			sceneC: null,
			dawnAzimuth: 0
		};
		const referenceHorizon = view.h * NIGHT_HORIZON;
		const camera = makeCamera(view, SOUTH, referenceHorizon);
		const referenceMinute = lerp(NIGHT_START, NIGHT_END, REFERENCE_PROGRESS);
		cache.referenceMagnitudes = this.#collectStars(
			camera,
			referenceMinute,
			DARK_SKY_LIMIT,
			Number.POSITIVE_INFINITY
		).map((star) => star.dm);
		return cache;
	}

	// ── 별 ──
	/** 화면 안 · 수평선 위 · 한계 등급 안의 별(밝은 순, cap 개까지) */
	#collectStars(camera: Camera, minute: number, limit: number, cap: number): ListedStar[] {
		const view = this.#view;
		const lst = localSiderealDegrees(this.#sky, minute);
		const list: ListedStar[] = [];
		const consider = (vector: Vector3, magnitude: number, tint: number): void => {
			if (vector[2] <= 0) return;
			const point = project(camera, vector);
			if (point === null) return;
			const [x, y] = point;
			if (x < 0 || x > view.w || y < 0 || y >= camera.horizonY) return;
			const dm = displayMagnitude(magnitude, vector[2]);
			const fade = clamp01((limit - dm) / STAR_FADE_MAGNITUDES);
			if (fade <= 0) return;
			list.push({ x, y, dm, tint, fade });
		};
		for (const star of this.#sky.stars) {
			consider(starVector(star, lst), star.magnitude, tintIndex(star.colorIndex));
		}
		SKY_PLANETS.forEach(([name, tint]) => {
			const body = bodyAt(this.#sky, minute, name);
			consider(vectorFromAltAz(body.alt, body.az), body.extra, tint);
		});
		list.sort((a, b) => a.dm - b.dm);
		if (list.length > cap) list.length = cap;
		return list;
	}

	/** 시안 A 의 밝기 분포(m = 순위^3.2)를 기준 화면의 실제 등급 순위로 매김 */
	#magnitudeToM(dm: number): number {
		const table = this.#cache.referenceMagnitudes;
		let low = 0;
		let high = table.length;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (table[mid] < dm) low = mid + 1;
			else high = mid;
		}
		const u = clamp01(1 - low / Math.max(1, table.length - 1));
		return Math.pow(u, 3.2);
	}

	#paintStars(list: ListedStar[], horizonY: number, withReflection: boolean): void {
		const { starLayer, starReflectLayer, starSprites } = this.#cache;
		const g = context2d(starLayer);
		const r = context2d(starReflectLayer);
		g.clearRect(0, 0, starLayer.width, starLayer.height);
		r.clearRect(0, 0, starReflectLayer.width, starReflectLayer.height);
		for (const star of list) {
			const bucket = Math.min(
				STAR_BUCKETS - 1,
				Math.floor(this.#magnitudeToM(star.dm) * STAR_BUCKETS)
			);
			const sprite = starSprites[star.tint][bucket];
			g.globalAlpha = star.fade;
			g.drawImage(sprite.canvas, star.x - sprite.half, star.y - sprite.half);
			if (withReflection && sprite.reflect !== null) {
				const reflectY = horizonY + (horizonY - star.y) * 0.42;
				if (reflectY < this.#view.h) {
					const reflect = sprite.reflect;
					r.globalAlpha = star.fade;
					r.drawImage(
						reflect.canvas,
						star.x - reflect.size * 0.5,
						reflectY - reflect.length / 2,
						reflect.width,
						reflect.length
					);
				}
			}
		}
		g.globalAlpha = 1;
		r.globalAlpha = 1;
	}

	#ensureStars(key: string, camera: Camera, minute: number, withReflection: boolean): number {
		const cache = this.#cache;
		if (cache.starKey === key) return cache.starCount;
		const limit = limitingMagnitude(bodyAt(this.#sky, minute, 'sun').alt);
		const list = this.#collectStars(camera, minute, limit, cache.referenceMagnitudes.length);
		this.#paintStars(list, camera.horizonY, withReflection);
		cache.starKey = key;
		cache.starCount = list.length;
		return list.length;
	}

	#drawStarReflections(horizonY: number, time: number): void {
		const { w, h, s } = this.#view;
		const step = Math.max(1, Math.round(2 * s));
		for (let y = Math.floor(horizonY); y < h; y += step) {
			const dx = calmWobble(y - horizonY, time, s);
			this.#ctx.drawImage(this.#cache.starReflectLayer, 0, y, w, step, dx, y, w, step);
		}
	}

	#draw(frame: SceneFrame, time: number): void {
		const ctx = this.#ctx;
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		let veil = 0;
		if (frame.kind === 'night') {
			this.#drawNight(frame, time);
			veil = frame.veil;
		} else if (frame.kind === 'sinking') {
			this.#drawSinking(frame, time);
			veil = frame.veil;
		} else if (frame.kind === 'dawn') {
			this.#drawDawn(frame, time);
			veil = frame.veil;
		} else {
			this.#drawDive(frame.depth, time);
		}
		this.#canvas.dataset.scene = frame.kind;
		this.#canvas.dataset.stars = String(this.#cache.starCount);
		if (veil > 0) {
			ctx.globalAlpha = clamp01(veil);
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, this.#view.w, this.#view.h);
			ctx.globalAlpha = 1;
		}
	}

	// ── 장면 A ──
	#bowXForA(progress: number, layers: SceneALayers): number {
		const { w } = this.#view;
		const length = SHIP_LENGTH * layers.scale;
		const keys: Array<[number, number]> = [
			[SHIP_A_ENTER, 0],
			[SHIP_A_CENTER, SHIP_A_BOW_AT_CENTER * w],
			[SHIP_A_EXIT, w + length]
		];
		const segment = progress < SHIP_A_CENTER ? 0 : 1;
		const [fromProgress, fromValue] = keys[segment];
		const [toProgress, toValue] = keys[segment + 1];
		return (
			fromValue + ((toValue - fromValue) * (progress - fromProgress)) / (toProgress - fromProgress)
		);
	}

	#drawShipA(progress: number, horizonY: number, time: number): void {
		const { w, h, s } = this.#view;
		const ctx = this.#ctx;
		if (this.#cache.sceneA === null) this.#cache.sceneA = buildSceneA(this.#view);
		const layers = this.#cache.sceneA;
		const { ship, scale, margin, waterline } = layers;
		const bowX = this.#bowXForA(progress, layers);
		const destX = bowX - SHIP_LENGTH * scale - margin;
		const destY = horizonY + 2 * s - waterline;
		if (destX >= w || destX + ship.width <= 0) return;
		// 물 아래 부분은 가로 줄로 잘라 일렁이게
		const step = Math.max(1, Math.round(2 * s));
		for (let row = waterline; row < ship.height; row += step) {
			const y = destY + row;
			if (y >= h) break;
			const dx = calmWobble(row - waterline, time, s);
			ctx.drawImage(ship, 0, row, ship.width, step, destX + dx, y, ship.width, step);
		}
		ctx.drawImage(ship, 0, 0, ship.width, waterline, destX, destY, ship.width, waterline);
	}

	#drawNight(frame: NightFrame, time: number): void {
		const view = this.#view;
		const { w, h } = view;
		const ctx = this.#ctx;
		const rest = h * NIGHT_HORIZON;
		const look = smooth((frame.progress - SHIP_A_EXIT) / (1 - SHIP_A_EXIT));
		const horizonY = lerp(rest, h * SKY_LOOK_HORIZON, look);
		const top = horizonY - rest;
		if (top > 0) {
			ctx.fillStyle = '#02040b';
			ctx.fillRect(0, 0, w, top);
		}
		ctx.fillStyle = vgrad(ctx, top, horizonY, [
			[0, '#02040b'],
			[0.55, '#06102a'],
			[1, '#16244a']
		]);
		ctx.fillRect(0, top, w, horizonY - top);
		if (horizonY < h) nightSea(ctx, view, horizonY, h - rest);
		const camera = makeCamera(view, SOUTH, horizonY);
		const minuteKey = Math.round(frame.minute * 2) / 2;
		this.#ensureStars(`A|${minuteKey}|${horizonY.toFixed(1)}`, camera, minuteKey, true);
		ctx.globalAlpha = frame.starAlpha;
		ctx.drawImage(this.#cache.starLayer, 0, 0);
		if (horizonY < h) this.#drawStarReflections(horizonY, time);
		ctx.globalAlpha = 1;
		if (horizonY < h) horizonLine(ctx, view, horizonY);
		if (frame.ship) this.#drawShipA(frame.progress, horizonY, time);
	}

	// ── 장면 B ──
	#shipBTransform(frame: SinkingFrame, horizon: number, scale: number) {
		const { w } = this.#view;
		const pivot = SHIP_B_PIVOT;
		const angle = (-frame.tilt * Math.PI) / 180;
		const offsetX = w * 0.6 - pivot * scale;
		return (x: number, y: number): [number, number] => {
			const dx = x - pivot;
			const rx = dx * Math.cos(angle) - y * Math.sin(angle) + pivot;
			const ry = dx * Math.sin(angle) + y * Math.cos(angle) - frame.sink;
			return [offsetX + rx * scale, horizon - ry * scale];
		};
	}

	#litLights(frame: SinkingFrame): ShipLight[] {
		if (!frame.lightsOn) return [];
		return this.#lights.filter((light) => light.order >= frame.cut);
	}

	/** 배: 뱃머리 쪽이 물 아래, 고물이 들림. 수면 위만 보이게 잘라 그림(시안 B) */
	#paintShipAbove(
		layers: SceneBLayers,
		frame: SinkingFrame,
		horizon: number,
		lit: ShipLight[],
		redStep: number
	): void {
		const { w, h } = this.#view;
		const key = `${frame.tilt.toFixed(4)}|${frame.sink.toFixed(4)}|${lit.length}|${redStep}|${w}|${h}`;
		if (layers.aboveKey === key) return;
		const toPx = this.#shipBTransform(frame, horizon, layers.scale);
		const o = context2d(layers.above);
		o.clearRect(0, 0, w, h);
		o.save();
		o.beginPath();
		o.rect(0, 0, w, horizon);
		o.clip();
		o.fillStyle = '#000104';
		shipPath(o, toPx);
		o.fill();
		for (const light of lit) {
			const [px, py] = toPx(light.x, light.height);
			if (py > horizon) continue;
			const sprite = light.mast
				? layers.mast
				: (light.white ? layers.whites : layers.dots)[redStep];
			o.drawImage(sprite.canvas, px - sprite.half, py - sprite.half);
		}
		o.restore();
		layers.aboveKey = key;
	}

	#drawSinking(frame: SinkingFrame, time: number): void {
		const view = this.#view;
		const { w, h, s, pr } = view;
		const ctx = this.#ctx;
		if (this.#cache.sceneB === null) this.#cache.sceneB = buildSceneB(view);
		const layers = this.#cache.sceneB;
		const horizon = h * SINKING_HORIZON;
		ctx.fillStyle = vgrad(ctx, 0, horizon, [
			[0, '#02040b'],
			[0.55, '#06102a'],
			[1, '#16244a']
		]);
		ctx.fillRect(0, 0, w, horizon);
		nightSea(ctx, view, horizon, h - horizon);
		const camera = makeCamera(view, SOUTH, horizon);
		const minuteKey = Math.round(frame.minute * 4) / 4;
		this.#ensureStars(`B|${minuteKey}`, camera, minuteKey, true);
		ctx.drawImage(this.#cache.starLayer, 0, 0);
		this.#drawStarReflections(horizon, time);
		horizonLine(ctx, view, horizon);

		const lit = this.#litLights(frame);
		const redStep = Math.round(frame.red * (RED_STEPS - 1));
		this.#canvas.dataset.lightsLit = String(lit.length);
		this.#paintShipAbove(layers, frame, horizon, lit, redStep);
		ctx.drawImage(layers.above, 0, 0);
		// 흔들린 반사(시안 B) — 아주 느리게
		for (let y = horizon; y < h; y += 2 * s) {
			const d = y - horizon;
			const source = horizon - d;
			if (source < 0) break;
			ctx.globalAlpha = 0.7 * (1 - d / (h * 0.35));
			if (ctx.globalAlpha <= 0) break;
			const dx = Math.sin((d * 0.22) / s + time * 0.5) * d * 0.03;
			ctx.drawImage(layers.above, 0, source - 2 * s, w, 2 * s, dx, y, w, 2 * s);
		}
		ctx.globalAlpha = 1;
		// 불빛 반사 기둥(장면 A 표현)
		const toPx = this.#shipBTransform(frame, horizon, layers.scale);
		const pillar = layers.pillars[redStep];
		lit.forEach((light, index) => {
			if (light.mast) return;
			const [px, py] = toPx(light.x, light.height);
			if (py > horizon) return;
			const reflectY = horizon + (horizon - py) * 1.0;
			const length = (horizon - py) * 2.4 + 20 * s;
			const sway = Math.sin(time * 0.5 + index * 0.7) * 0.5 * s;
			ctx.drawImage(
				pillar,
				px - layers.rad * 0.55 + sway,
				reflectY - length * 0.2,
				layers.rad * 1.1,
				length
			);
		});
		// 선체가 물에 닿는 자리의 흐트러진 물결
		const [waterX] = toPx(120, 0);
		ctx.fillStyle = 'rgba(150,175,225,.22)';
		for (let i = 0; i < 5; i += 1) {
			ctx.fillRect(
				waterX - 30 * s + i * 7 * s,
				horizon + (1 + i * 2.2) * s,
				w * 0.42 - i * 10 * s,
				0.9 * s
			);
		}
		// 앞쪽 보트: 아주 작게 흔들림
		const bob = Math.sin((time * 2 * Math.PI) / BOAT_BOB_SECONDS) * BOAT_BOB_CSS_PIXELS * pr;
		ctx.drawImage(layers.boat, 0, bob);
	}

	// ── 장면 C ──
	/**
	 * 카메라 방위: 마지막 시각(05:43) 금성이 두 빙산(가운데 빙산 · 큰 빙산) 사이 틈의 가운데에 오게 정한다(금성 계산 위치 우선).
	 * 해 쪽 빛 · 물빛 길은 이 방위에서 해의 계산 방위(v3 와 같은 05:28.5 무렵)를 따른다.
	 */
	#dawnCamera(): { azimuth: number; sunX: number } {
		const view = this.#view;
		const objectWidth = objectWidthOf(view);
		const midRight = view.w * MID_BERG.centerX + (objectWidth * MID_BERG.width) / 2;
		const bigLeft = view.w * BIG_BERG.centerX - (objectWidth * BIG_BERG.width) / 2;
		const venusX = (midRight + bigLeft) / 2;
		const venus = bodyAt(this.#sky, DAWN_END, 'venus');
		const azimuth = venus.az - Math.atan((venusX - view.w / 2) / view.f) / DEGREES;
		const sunMinute = lerp(V3_DAWN_START, DAWN_END, DAWN_FULL_PROGRESS);
		const sun = bodyAt(this.#sky, sunMinute, 'sun');
		const sunX = view.w / 2 + view.f * Math.tan((sun.az - azimuth) * DEGREES);
		return { azimuth, sunX };
	}

	#ensureSceneC(): SceneCLayers {
		if (this.#cache.sceneC !== null) return this.#cache.sceneC;
		const { azimuth, sunX } = this.#dawnCamera();
		this.#cache.dawnAzimuth = azimuth;
		this.#cache.sceneC = buildSceneC(this.#view, sunX);
		this.#canvas.dataset.dawnAzimuth = azimuth.toFixed(2);
		this.#canvas.dataset.sunX = (sunX / this.#view.w).toFixed(3);
		return this.#cache.sceneC;
	}

	#dawnAmount(minute: number): number {
		const sunStart = bodyAt(this.#sky, V3_DAWN_START, 'sun').alt;
		const sunFull = bodyAt(this.#sky, lerp(V3_DAWN_START, DAWN_END, DAWN_FULL_PROGRESS), 'sun').alt;
		const sunAltitude = bodyAt(this.#sky, minute, 'sun').alt;
		return clamp01((sunAltitude - sunStart) / (sunFull - sunStart));
	}

	#drawDawnSky(layers: SceneCLayers, dawn: number, aurora: number): void {
		const { w } = this.#view;
		const ctx = this.#ctx;
		const horizon = layers.horizon;
		// 하늘: 밤 → 시안 C(수평선 쪽부터 밝아짐)
		const skyStops = DAWN_SKY_POSITIONS.map((position, index): [number, string] => {
			const lag = (1 - position) * 0.35;
			const color = mixRgb(
				sampleStops(NIGHT_SKY_STOPS, position),
				DAWN_SKY_COLORS[index],
				smooth((dawn - lag) / (1 - lag))
			);
			return [position, cssRgb(color)];
		});
		ctx.fillStyle = vgrad(ctx, 0, horizon, skyStops);
		ctx.fillRect(0, 0, w, horizon);
		const glowAmount = Math.pow(dawn, 1.5);
		if (glowAmount > 0) {
			const glow = ctx.createRadialGradient(layers.sunX, horizon, 0, layers.sunX, horizon, w * 0.9);
			glow.addColorStop(0, 'rgba(255,226,170,.75)');
			glow.addColorStop(0.35, 'rgba(255,210,150,.18)');
			glow.addColorStop(1, 'rgba(255,210,150,0)');
			ctx.globalAlpha = glowAmount;
			ctx.fillStyle = glow;
			ctx.fillRect(0, 0, w, horizon);
			ctx.globalAlpha = 1;
		}
		if (aurora > 0.001) {
			ctx.globalAlpha = aurora;
			ctx.globalCompositeOperation = 'lighter';
			ctx.drawImage(layers.aurora, 0, 0);
			ctx.globalCompositeOperation = 'source-over';
			ctx.globalAlpha = 1;
		}
	}

	/** 금성: 계산 위치(수평선 위일 때만). 모양은 v3 그대로. */
	#drawVenus(camera: Camera, minute: number): void {
		const { s, w, h } = this.#view;
		const ctx = this.#ctx;
		const venus = bodyAt(this.#sky, minute, 'venus');
		const point = venus.alt > 0 ? project(camera, vectorFromAltAz(venus.alt, venus.az)) : null;
		if (point === null || point[1] >= camera.horizonY) {
			delete this.#canvas.dataset.venus;
			return;
		}
		const [vx, vy] = point;
		this.#canvas.dataset.venus = `${(vx / w).toFixed(3)},${(vy / h).toFixed(3)}`;
		const gradient = ctx.createRadialGradient(vx, vy, 0, vx, vy, 12 * s);
		gradient.addColorStop(0, 'rgba(255,255,255,.9)');
		gradient.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc(vx, vy, 12 * s, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#fff';
		ctx.beginPath();
		ctx.arc(vx, vy, 1.7 * s, 0, Math.PI * 2);
		ctx.fill();
	}

	/** 물체 층(빙산 · 유빙): 밤 덩어리 → 역광 테두리 → 면 색 */
	#paintObjects(layers: SceneCLayers, rim: number, face: number): void {
		const { w, h } = this.#view;
		const key = `${Math.round(rim * 64)}|${Math.round(face * 64)}`;
		if (layers.objectsKey === key) return;
		const o = context2d(layers.objects);
		o.clearRect(0, 0, w, h);
		o.drawImage(layers.dark, 0, 0);
		o.globalAlpha = Math.round(face * 64) / 64;
		o.drawImage(layers.face, 0, 0);
		o.globalAlpha = Math.round(rim * 64) / 64;
		o.drawImage(layers.rim, 0, 0);
		o.globalAlpha = 1;
		layers.objectsKey = key;
	}

	#drawDawnSea(layers: SceneCLayers, dawn: number, glitter: number, time: number): void {
		const { w, h, s } = this.#view;
		const ctx = this.#ctx;
		const horizon = layers.horizon;
		// 바다: 하늘보다 확실히 어둡게
		const seaStops = DAWN_SEA_POSITIONS.map((position, index): [number, string] => [
			position,
			cssRgb(mixRgb(mixRgb(NIGHT_SEA[0], NIGHT_SEA[1], position), DAWN_SEA_COLORS[index], dawn))
		]);
		ctx.fillStyle = vgrad(ctx, horizon, h, seaStops);
		ctx.fillRect(0, horizon, w, h - horizon);
		if (glitter > 0) {
			ctx.globalAlpha = glitter;
			ctx.drawImage(layers.glitter, 0, 0);
			ctx.globalAlpha = 1;
		}
		// 잔물결: 띠마다 아주 느리게 옆으로
		ctx.globalAlpha = lerp(0.4, 1, dawn);
		const bands = 24;
		const seaHeight = h - horizon;
		for (let band = 0; band < bands; band += 1) {
			const y0 = horizon + (seaHeight * band) / bands;
			const bandHeight = seaHeight / bands;
			const dx = Math.sin(time * 0.25 + band * 1.7) * (0.6 + (3 * band) / bands) * s;
			ctx.drawImage(layers.ripples, 0, y0, w, bandHeight, dx, y0, w, bandHeight);
		}
		ctx.globalAlpha = 1;
	}

	#drawDawnObjects(
		layers: SceneCLayers,
		effects: { rim: number; face: number; haze: number },
		time: number
	): void {
		const { w, h, s } = this.#view;
		const ctx = this.#ctx;
		const horizon = layers.horizon;
		const band = layers.bandBottom - layers.bandTop;
		ctx.drawImage(layers.objects, 0, layers.bandTop, w, band, 0, layers.bandTop, w, band);
		for (let y = horizon; y < h; y += 1.5 * s) {
			const d = y - horizon;
			const source = horizon - d;
			if (source < 0) break;
			const fade = 1 - d / (h * 0.32);
			if (fade <= 0) break;
			ctx.globalAlpha = 0.55 * fade;
			const dx =
				(Math.sin((d * 0.21) / s + 1.3 + time * 0.35) +
					0.6 * Math.sin((d * 0.53) / s - time * 0.22)) *
				(0.5 + d * 0.012);
			ctx.drawImage(layers.objects, 0, source - 1.5 * s, w, 1.5 * s, dx, y, w, 1.5 * s);
		}
		ctx.globalAlpha = 1;
		// 물 아래로 비치는 밑동(빙산의 대부분은 물 아래)
		if (effects.face > 0) {
			const bergs: Array<[SceneCLayers['bigBerg'], number]> = [
				[layers.bigBerg, 0.16],
				[layers.midBerg, 0.09]
			];
			bergs.forEach(([berg, alpha]) => {
				const gradient = ctx.createLinearGradient(0, horizon, 0, horizon + berg.height * 0.5);
				gradient.addColorStop(0, `rgba(120,200,205,${alpha * effects.face})`);
				gradient.addColorStop(1, 'rgba(120,200,205,0)');
				ctx.fillStyle = gradient;
				ctx.beginPath();
				ctx.ellipse(
					berg.x0 + berg.width * 0.5,
					horizon + 1,
					berg.width * 0.55,
					berg.height * 0.3,
					0,
					0,
					Math.PI
				);
				ctx.fill();
			});
		}
		// 수평선 아지랑이
		if (effects.haze > 0) {
			ctx.globalAlpha = effects.haze;
			ctx.fillStyle = vgrad(ctx, horizon - h * 0.03, horizon + h * 0.01, [
				[0, 'rgba(243,220,174,0)'],
				[0.75, 'rgba(243,220,174,.35)'],
				[1, 'rgba(243,220,174,0)']
			]);
			ctx.fillRect(0, horizon - h * 0.03, w, h * 0.04);
			ctx.globalAlpha = 1;
		}
		// 앞쪽 떠다니는 작은 얼음 조각
		const floatHeight = h - layers.floatTop;
		const top = layers.floatTop;
		ctx.drawImage(layers.floatsDark, 0, top, w, floatHeight, 0, top, w, floatHeight);
		if (effects.face > 0) {
			ctx.globalAlpha = effects.face;
			ctx.drawImage(layers.floatsFace, 0, top, w, floatHeight, 0, top, w, floatHeight);
		}
		if (effects.rim > 0) {
			ctx.globalAlpha = effects.rim;
			ctx.drawImage(layers.floatsRim, 0, top, w, floatHeight, 0, top, w, floatHeight);
		}
		ctx.globalAlpha = 1;
	}

	#drawDawn(frame: DawnFrame, time: number): void {
		const layers = this.#ensureSceneC();
		const dawnRaw = this.#dawnAmount(frame.minute);
		const dawn = Math.pow(dawnRaw, DAWN_SKY_EASING);
		const effects = {
			rim: smooth((dawnRaw - 0.3) / 0.25),
			face: smooth((dawnRaw - 0.55) / 0.3),
			haze: smooth((dawnRaw - 0.75) / 0.25)
		};
		this.#drawDawnSky(layers, dawn, auroraAlpha(frame.minute));
		const camera = makeCamera(this.#view, this.#cache.dawnAzimuth, layers.horizon);
		const minuteKey = Math.round(frame.minute * 2) / 2;
		this.#ensureStars(`C|${minuteKey}`, camera, minuteKey, false);
		this.#ctx.drawImage(this.#cache.starLayer, 0, 0);
		this.#drawVenus(camera, frame.minute);
		this.#paintObjects(layers, effects.rim, effects.face);
		this.#drawDawnSea(layers, dawn, glitterAlpha(frame.minute), time);
		this.#drawDawnObjects(layers, effects, time);
	}

	/** 에필로그 앞 물속 암전: 장면 C 끝을 위로 밀어 올리며 수면 아래로 내려가고, 물빛이 검게 닫힌다. */
	#drawDive(depth: number, time: number): void {
		const { w, h } = this.#view;
		const ctx = this.#ctx;
		const horizon = h * DAWN_HORIZON;
		const waterY = lerp(horizon, 0, smooth(depth / DIVE_RISE_SHARE));
		ctx.save();
		ctx.translate(0, waterY - horizon);
		this.#drawDawn({ kind: 'dawn', minute: DAWN_END, veil: 0 }, time);
		ctx.restore();
		ctx.fillStyle = vgrad(ctx, waterY, h, [
			[0, UNDERWATER_TOP],
			[1, UNDERWATER_BOTTOM]
		]);
		ctx.fillRect(0, waterY, w, h - waterY);
		const dark = smooth((depth - DIVE_DARK_FROM) / (1 - DIVE_DARK_FROM));
		if (dark > 0) {
			ctx.globalAlpha = dark;
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			ctx.globalAlpha = 1;
		}
	}
}
