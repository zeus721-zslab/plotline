// 바다 밑의 도시들 배경(Canvas 2D): 수면 아래 시점. 위쪽은 일렁이는 수면 빛, 바닥에는 장마다 윤곽 하나(seaPaint.ts).
// 장이 바뀌면 스크롤 진행도(setProgress, 장 앞 빈 장면 구간)를 따라 앞 장 윤곽이 옅어지고 새 장 윤곽이 짙어진다(배경 먼저 · 카드 나중).
// 두 장 이상 한 번에 건너뛰면 옮겨 가기 없이 새 장으로 바로 놓는다. 시그니처(3장 물이 차오름 · 7장 도시가 기울며 가라앉음
// · 8장 조각 조립)와 4장 골목 윤곽(흩어진 돌 → 벽 줄)은 setSignature 진행도를 따른다. 동작 줄이기 · 저사양은 장마다 끝난 모습 한 장만 그린다.
// 구도: 휴대폰은 계기판 아래 전체, PC(1024px 이상)는 최대 1600px 구도의 오른쪽 6할 영역에 윤곽을 둔다(3편과 같은 4:6 구도).
import { pickProfile, type RenderProfile } from '../light-age/skyRenderer.ts';
import type { ChapterId } from './chapters.ts';
import { HARBOR_TILT_RAD, paintOutline, type Geometry, type OutlineId } from './seaPaint.ts';

export { isLowEndDevice } from '../light-age/skyRenderer.ts';

export type SceneId = 'cover' | ChapterId;

// 수면 자리: top 은 계기판 바로 아래(화면 전체가 물속), land 는 언덕 중턱에서 시그니처만큼 위로 차오름, harbor 는 도시가 서 있는 물가
type SurfaceKind = 'top' | 'land' | 'harbor';

type SceneParams = {
	outline: OutlineId;
	surface: SurfaceKind;
	// 물빛 어두운 정도(0~1): 장이 깊어질수록 어둡게
	depth: number;
};

const SCENES: Record<SceneId, SceneParams> = {
	cover: { outline: 'none', surface: 'top', depth: 0 },
	atlantis: { outline: 'rings', surface: 'top', depth: 0.15 },
	lyonesse: { outline: 'walls', surface: 'top', depth: 0.2 },
	doggerland: { outline: 'land', surface: 'land', depth: 0.25 },
	pavlopetri: { outline: 'alleys', surface: 'top', depth: 0.3 },
	baiae: { outline: 'mosaic', surface: 'top', depth: 0.35 },
	heracleion: { outline: 'statue', surface: 'top', depth: 0.45 },
	'port-royal': { outline: 'harbor', surface: 'harbor', depth: 0.4 },
	end: { outline: 'assemble', surface: 'top', depth: 0.3 }
};

// 계기판 높이(GaugeBar.svelte .gauge height 와 같은 값)
const GAUGE_PX = 48;
// SunkenCitiesPage.svelte 의 PC 미디어 쿼리와 같은 값
const SPLIT_MIN_WIDTH_PX = 1024;
const COMPOSITION_MAX_PX = 1600;
const CARD_COLUMN_SHARE = 0.4;
// 윤곽 가운데 x: PC 는 오른쪽 영역 폭의 이 비율(가운데 선 쪽)
const DESKTOP_CENTER_SHARE = 0.45;
// 바닥 높이(영역 위에서 비율): 휴대폰은 카드가 화면 가운데로 오기 전(시그니처가 끝난 뒤)에야 가리도록 조금 위로
const MOBILE_FLOOR_SHARE = 0.62;
const DESKTOP_FLOOR_SHARE = 0.72;
// 윤곽 폭: 영역 폭의 비율 · 상한(px)
const OUTLINE_WIDTH_SHARE = 0.84;
const OUTLINE_MAX_PX = 560;
const UNITS_PER_OUTLINE = 100;
// 땅 장면 처음 수면(바닥에서 u) · 항구가 서 있는 물가(바닥에서 u)
const LAND_START_SURFACE_UNITS = 22;
const HARBOR_SURFACE_UNITS = 50;
// 스크롤 진행도로 정한 값을 화면이 따라가는 빠르기(초당 비율)
const SMOOTH_PER_SECOND = 6;
// 물빛: 얕은 곳 · 깊은 곳 · 물 위 하늘 · 바닥 모래
const SHALLOW_RGB: [number, number, number] = [20, 96, 108];
const DEEP_RGB: [number, number, number] = [3, 20, 28];
const SKY_RGB = '62, 78, 92';
const SAND_RGB = '26, 56, 58';
const LIGHT_RGB = '200, 245, 240';
// 수면 빛줄기 수 · 흔들림
const SHAFTS = 6;
const SHAFT_SWAY_PER_SECOND = 0.25;
// PC 카드 쪽 그늘(3편과 같은 짙기 단계)
const CARD_SHADE_STOPS: ReadonlyArray<[number, number]> = [
	[0, 0.85],
	[0.7, 0.5],
	[1, 0]
];
// 떠다니는 알갱이: 프로필 별 수의 이 비율 · 오르는 빠르기(화면 높이 / 초)
const PARTICLE_SHARE = 0.5;
const PARTICLE_RISE = 0.02;

type Particle = { x: number; y: number; radius: number };

function lerp(from: number, to: number, ratio: number): number {
	return from + (to - from) * ratio;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export class SeaRenderer {
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private profile: RenderProfile;
	private width = 0;
	private height = 0;
	private sceneId: SceneId;
	private previousId: SceneId;
	private progress = 1;
	private shownProgress = 1;
	private signature = 1;
	private shownSignature = 1;
	private particles: Particle[] = [];
	private elapsed = 0;

	constructor(canvas: HTMLCanvasElement, scene: SceneId) {
		this.canvas = canvas;
		const context = canvas.getContext('2d');
		if (context === null) throw new Error('canvas 2d context unavailable');
		this.context = context;
		this.sceneId = scene;
		this.previousId = scene;
		this.profile = pickProfile(window.innerWidth);
	}

	get framesPerSecond(): number {
		return this.profile.fps;
	}

	resize(): void {
		this.profile = pickProfile(window.innerWidth);
		const ratio = Math.min(window.devicePixelRatio, this.profile.pixelRatioCap);
		this.width = window.innerWidth;
		this.height = window.innerHeight;
		this.canvas.width = Math.round(this.width * ratio);
		this.canvas.height = Math.round(this.height * ratio);
		this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
		const count = Math.round(this.profile.stars * PARTICLE_SHARE);
		this.particles = Array.from({ length: count }, () => ({
			x: Math.random(),
			y: Math.random(),
			radius: 0.5 + Math.random() * 1.2
		}));
	}

	/** instant 면(두 장 이상 건너뜀) 옮겨 가기 없이 새 장으로 바로 놓는다. */
	setScene(scene: SceneId, instant: boolean): void {
		if (scene === this.sceneId) return;
		this.previousId = instant ? scene : this.sceneId;
		this.sceneId = scene;
		this.shownProgress = instant ? 1 : 0;
		this.shownSignature = instant ? this.signature : 0;
	}

	/** 새 장으로 옮겨 간 정도(0~1) */
	setProgress(progress: number): void {
		this.progress = clamp01(progress);
	}

	/** 시그니처 진행도(0~1) */
	setSignature(signature: number): void {
		this.signature = clamp01(signature);
	}

	/** 움직이지 않는 한 장: 옮겨 가기 · 시그니처가 끝난 모습 */
	drawStill(): void {
		this.previousId = this.sceneId;
		this.shownProgress = 1;
		this.shownSignature = 1;
		this.draw(true);
	}

	step(seconds: number): void {
		this.elapsed += seconds;
		const ratio = Math.min(1, seconds * SMOOTH_PER_SECOND);
		this.shownProgress = lerp(this.shownProgress, this.progress, ratio);
		this.shownSignature = lerp(this.shownSignature, this.signature, ratio);
		for (const particle of this.particles) {
			particle.y -= PARTICLE_RISE * seconds;
			if (particle.y < 0) particle.y += 1;
		}
		this.draw(false);
	}

	private get desktop(): boolean {
		return this.width >= SPLIT_MIN_WIDTH_PX;
	}

	private regionX(): { x: number; width: number } {
		if (!this.desktop) return { x: 0, width: this.width };
		const composition = Math.min(this.width, COMPOSITION_MAX_PX);
		const middleLine = (this.width - composition) / 2 + composition * CARD_COLUMN_SHARE;
		return { x: middleLine, width: composition * (1 - CARD_COLUMN_SHARE) };
	}

	private geometryBase(): Omit<Geometry, 'surfaceY'> & { top: number } {
		const region = this.regionX();
		const top = GAUGE_PX;
		const height = this.height - GAUGE_PX;
		const outlineWidth = Math.min(region.width * OUTLINE_WIDTH_SHARE, OUTLINE_MAX_PX);
		return {
			top,
			centerX: region.x + region.width * (this.desktop ? DESKTOP_CENTER_SHARE : 0.5),
			floorY: top + height * (this.desktop ? DESKTOP_FLOOR_SHARE : MOBILE_FLOOR_SHARE),
			unit: outlineWidth / UNITS_PER_OUTLINE
		};
	}

	private surfaceOf(
		scene: SceneId,
		signature: number,
		base: { top: number; floorY: number; unit: number }
	): number {
		switch (SCENES[scene].surface) {
			case 'top':
				return base.top;
			case 'land':
				return lerp(base.floorY - LAND_START_SURFACE_UNITS * base.unit, base.top, signature);
			case 'harbor':
				return base.floorY - HARBOR_SURFACE_UNITS * base.unit;
		}
	}

	/** 물 위 하늘은 수면이 계기판 아래로 내려온 장면(땅 · 항구)에서만 그리고, 그 밖에는 화면 맨 위까지 물빛이다. */
	private paintWater(surfaceY: number, depth: number): void {
		const { context } = this;
		const waterTop = surfaceY > GAUGE_PX + 1 ? surfaceY : 0;
		if (waterTop > 0) {
			context.fillStyle = `rgb(${SKY_RGB})`;
			context.fillRect(0, 0, this.width, waterTop);
		}
		const shallow = SHALLOW_RGB.map((value, index) =>
			Math.round(lerp(value, DEEP_RGB[index], depth))
		);
		const water = context.createLinearGradient(0, waterTop, 0, this.height);
		water.addColorStop(0, `rgb(${shallow.join(', ')})`);
		water.addColorStop(1, `rgb(${DEEP_RGB.join(', ')})`);
		context.fillStyle = water;
		context.fillRect(0, waterTop, this.width, this.height - waterTop);
	}

	private paintShafts(surfaceY: number, still: boolean): void {
		const { context } = this;
		const sway = still ? 0 : Math.sin(this.elapsed * SHAFT_SWAY_PER_SECOND);
		for (let index = 0; index < SHAFTS; index += 1) {
			const x = ((index + 0.5) / SHAFTS) * this.width + sway * 30 * (index % 2 === 0 ? 1 : -1);
			const spread = this.width / SHAFTS / 3;
			const light = context.createLinearGradient(0, surfaceY, 0, this.height * 0.8);
			light.addColorStop(0, `rgba(${LIGHT_RGB}, 0.12)`);
			light.addColorStop(1, `rgba(${LIGHT_RGB}, 0)`);
			context.fillStyle = light;
			context.beginPath();
			context.moveTo(x - spread / 2, surfaceY);
			context.lineTo(x + spread / 2, surfaceY);
			context.lineTo(x + spread * 1.5 + 40, this.height * 0.8);
			context.lineTo(x - spread * 0.5 + 40, this.height * 0.8);
			context.closePath();
			context.fill();
		}
	}

	/** 수면: 일렁이는 밝은 선 */
	private paintSurface(surfaceY: number, still: boolean): void {
		const { context } = this;
		const time = still ? 0 : this.elapsed;
		context.beginPath();
		for (let x = 0; x <= this.width; x += 8) {
			const y = surfaceY + Math.sin(x / 37 + time * 1.4) * 2 + Math.sin(x / 13 - time) * 1;
			if (x === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.strokeStyle = `rgba(${LIGHT_RGB}, 0.55)`;
		context.lineWidth = 2;
		context.stroke();
	}

	private paintFloor(floorY: number, unit: number): void {
		const { context } = this;
		const top = floorY - 10 * unit;
		const sand = context.createLinearGradient(0, top, 0, this.height);
		sand.addColorStop(0, `rgba(${SAND_RGB}, 0)`);
		sand.addColorStop(0.3, `rgba(${SAND_RGB}, 0.6)`);
		sand.addColorStop(1, `rgba(${SAND_RGB}, 0.9)`);
		context.fillStyle = sand;
		context.fillRect(0, top, this.width, this.height - top);
	}

	private paintParticles(surfaceY: number): void {
		const { context } = this;
		context.fillStyle = `rgba(${LIGHT_RGB}, 0.35)`;
		for (const particle of this.particles) {
			const y = particle.y * this.height;
			if (y < surfaceY) continue;
			context.beginPath();
			context.arc(particle.x * this.width, y, particle.radius, 0, Math.PI * 2);
			context.fill();
		}
	}

	private paintCardShade(regionLeft: number): void {
		const { context } = this;
		const shade = context.createLinearGradient(0, 0, regionLeft, 0);
		for (const [offset, alpha] of CARD_SHADE_STOPS) {
			shade.addColorStop(offset, `rgba(${DEEP_RGB.join(', ')}, ${alpha})`);
		}
		context.fillStyle = shade;
		context.fillRect(0, 0, regionLeft, this.height);
	}

	private draw(still: boolean): void {
		const base = this.geometryBase();
		const progress = this.shownProgress;
		const signature = this.shownSignature;
		const previousSurface = this.surfaceOf(this.previousId, 1, base);
		const currentSurface = this.surfaceOf(this.sceneId, signature, base);
		const surfaceY = lerp(previousSurface, currentSurface, progress);
		const depth = lerp(SCENES[this.previousId].depth, SCENES[this.sceneId].depth, progress);
		const geometry: Geometry = { ...base, surfaceY };
		const harborRestingY = base.floorY - HARBOR_SURFACE_UNITS * base.unit;
		this.paintWater(surfaceY, depth);
		this.paintShafts(surfaceY, still);
		this.paintFloor(base.floorY, base.unit);
		const common = { context: this.context, geometry, seconds: this.elapsed, still };
		if (this.previousId !== this.sceneId) {
			const previous = { ...common, alpha: 1 - progress, signature: 1 };
			paintOutline(previous, SCENES[this.previousId].outline, this.width, harborRestingY);
		}
		const current = { ...common, alpha: progress, signature };
		const outlineTop = paintOutline(
			current,
			SCENES[this.sceneId].outline,
			this.width,
			harborRestingY
		);
		this.paintSurface(surfaceY, still);
		this.paintParticles(surfaceY);
		const region = this.regionX();
		if (this.desktop) this.paintCardShade(region.x);
		this.markFocus(base.floorY, surfaceY, outlineTop, base.centerX, signature);
	}

	/** 화면 확인용 표시(data-focus): 바닥 · 수면 · 윤곽 위쪽 끝 · 가운데 x · 항구 기울기(도). 값이 바뀔 때만 쓴다. */
	private markFocus(
		floorY: number,
		surfaceY: number,
		outlineTop: number | null,
		centerX: number,
		signature: number
	): void {
		const harbor = SCENES[this.sceneId].outline === 'harbor';
		const marks = {
			floorY: Math.round(floorY),
			surfaceY: Math.round(surfaceY),
			outlineTop: outlineTop === null ? null : Math.round(outlineTop),
			centerX: Math.round(centerX),
			tiltDegrees: harbor ? Math.round(((HARBOR_TILT_RAD * signature) / Math.PI) * 180) : null
		};
		const text = JSON.stringify(marks);
		if (this.canvas.dataset.focus !== text) this.canvas.dataset.focus = text;
	}
}
