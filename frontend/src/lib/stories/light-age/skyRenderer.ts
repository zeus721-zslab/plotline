// 빛의 나이 배경 그리기(Canvas 2D): 지구 쪽(화면 아래)으로 흐르는 빛줄기와 별 입자, 장마다 색조 · 휨 · 블랙홀(blackHole.ts).
// 독자가 아래로 읽어 내려갈수록 빛을 거슬러 오르는 느낌이 나도록 스크롤한 만큼 흐름을 빠르게 하고, 멈춰도 느리게 계속 흐른다.
import { BlackHole } from './blackHole.ts';
import { SCENES, type SceneId, type SceneParams } from './scenes.ts';

// 기기별 상한. 휴대폰은 화면이 작아 입자를 줄여도 밀도가 비슷하고, 30fps · 픽셀 배율 1.5 로 그리기 양을 1/4 가까이 줄인다.
export type RenderProfile = {
	stars: number;
	streaks: number;
	// 블랙홀 원반 위를 흐르는 호 조각 수
	diskPieces: number;
	fps: number;
	pixelRatioCap: number;
};
export const DESKTOP_PROFILE: RenderProfile = {
	stars: 180,
	streaks: 30,
	diskPieces: 160,
	fps: 60,
	pixelRatioCap: 2
};
export const MOBILE_PROFILE: RenderProfile = {
	stars: 80,
	streaks: 14,
	diskPieces: 70,
	fps: 30,
	pixelRatioCap: 1.5
};
const MOBILE_MAX_WIDTH_PX = 768;
// 저사양(코어 2개 이하 또는 메모리 2GB 이하)은 움직이지 않는 한 장만 그린다.
const LOW_END_MAX_CORES = 2;
const LOW_END_MAX_MEMORY_GB = 2;

// theme.css --story-bg 와 같은 값
const BACKGROUND = '#070b16';
const LIGHT_RGB = '255, 228, 170';
const STAR_RGB = '230, 236, 255';
const SUN_RGB = '255, 220, 150';

// 장이 바뀔 때 값이 목표로 옮겨 가는 빠르기(초당 비율)
const EASE_PER_SECOND = 2;
// 스크롤 가속: 화면 높이만큼 스크롤하면 흐름이 이 배수만큼 더해지고, 초당 SCROLL_DECAY 비율로 잦아든다.
const SCROLL_BOOST_PER_SCREEN = 6;
const SCROLL_BOOST_MAX = 6;
const SCROLL_DECAY = 3;
// 글 기둥(가운데) 안 빛줄기는 덜 밝게 해 글 주변 움직임을 약하게 한다.
const COLUMN_HALF_WIDTH_PX = 300;
const COLUMN_ALPHA = 0.55;
// 장 진입 움직임 길이(초)
const GLOW_SECONDS = 3;
const BEND_PULSE_SECONDS = 1.6;
const BEND_PULSE_AMOUNT = 0.6;
// 그림자 위치(화면 비율)와 끝 장에서 화면을 다 덮는 반지름 배수(대각선 대비)
// 세로 위치는 그림자 위로 휜 띠까지 화면 안에 들어오게 잡는다.
const SHADOW_CENTER_X = 0.5;
const SHADOW_CENTER_Y = 0.42;
const SHADOW_COVER_RATIO = 0.75;
const PROBE_X = 0.64;
const PROBE_Y = 0.42;
// 이보다 작은 그림자(CSS px)는 그리지 않는다.
const MIN_VISIBLE_RADIUS = 0.5;
// 화면에 그리는 그림자 반지름이 목표 반지름을 따라가는 빠르기(초당 비율). 시간 상수 0.1초:
// 빠른 스크롤이나 장 판정이 늦게 바뀌어 목표가 한 번에 움직여도 0.3초 안에 95% 따라가 튀지 않는다.
const RADIUS_FOLLOW_PER_SECOND = 10;

type Star = { x: number; y: number; radius: number; depth: number };
type Streak = { x: number; y: number; length: number; factor: number };
type Mixed = Omit<SceneParams, 'pulse' | 'probe'> & { probe: number };

function random(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function lerp(from: number, to: number, ratio: number): number {
	return from + (to - from) * ratio;
}

function toMixed(params: SceneParams): Mixed {
	return { ...params, tint: [...params.tint], probe: params.probe ? 1 : 0 };
}

function deviceMemoryGb(): number | null {
	// deviceMemory 는 일부 브라우저에만 있다(타입 정의에 없음).
	const memory: unknown = Reflect.get(navigator, 'deviceMemory');
	return typeof memory === 'number' ? memory : null;
}

export function isLowEndDevice(): boolean {
	const memory = deviceMemoryGb();
	return (
		navigator.hardwareConcurrency <= LOW_END_MAX_CORES ||
		(memory !== null && memory <= LOW_END_MAX_MEMORY_GB)
	);
}

export function pickProfile(viewportWidth: number): RenderProfile {
	return viewportWidth < MOBILE_MAX_WIDTH_PX ? MOBILE_PROFILE : DESKTOP_PROFILE;
}

/** 끝 장에서 화면을 다 덮는 그림자 반지름(CSS px) */
export function shadowCoverRadius(width: number, height: number): number {
	return Math.hypot(width, height) * SHADOW_COVER_RATIO;
}

/**
 * 끝 장 그림자 반지름: 진행 0 이면 12장 반지름(base), 1 이면 화면을 덮는 반지름(cover).
 * 같은 비율로 커지는 기하 보간(base × (cover/base)^진행)이라 확대 빠르기가 처음부터 끝까지 같게 느껴지고,
 * 반지름(px)으로는 처음엔 완만하고 갈수록 빨라지는 ease-in 곡선이 된다.
 */
export function endShadowRadius(base: number, cover: number, progress: number): number {
	const clamped = Math.min(1, Math.max(0, progress));
	// 12장 그림자가 아직 나타나는 중(0)이면 비율을 정할 수 없어 직선으로 키운다(빠른 스크롤에서만 잠깐).
	if (base <= 0) return lerp(base, cover, clamped);
	return base * (cover / base) ** clamped;
}

export class SkyRenderer {
	private readonly context: CanvasRenderingContext2D;
	private profile: RenderProfile;
	private width = 0;
	private height = 0;
	private stars: Star[] = [];
	private streaks: Streak[] = [];
	private current: Mixed;
	private target: SceneParams;
	private pulseStartedAt = 0;
	private endProgress = 0;
	private scrollBoost = 0;
	private elapsed = 0;
	// 화면에 그리는 그림자 반지름(목표를 프레임마다 따라감). null 이면 다음 프레임에 목표로 바로 맞춘다.
	private drawnRadius: number | null = null;
	private readonly blackHole = new BlackHole();

	private readonly canvas: HTMLCanvasElement;

	constructor(canvas: HTMLCanvasElement, scene: SceneId) {
		this.canvas = canvas;
		const context = canvas.getContext('2d');
		if (context === null) throw new Error('canvas 2d context unavailable');
		this.context = context;
		this.target = SCENES[scene];
		this.current = toMixed(this.target);
		this.profile = pickProfile(window.innerWidth);
	}

	resize(): void {
		this.profile = pickProfile(window.innerWidth);
		const ratio = Math.min(window.devicePixelRatio, this.profile.pixelRatioCap);
		this.width = window.innerWidth;
		this.height = window.innerHeight;
		this.canvas.width = Math.round(this.width * ratio);
		this.canvas.height = Math.round(this.height * ratio);
		this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
		this.stars = Array.from({ length: this.profile.stars }, () => ({
			x: Math.random(),
			y: Math.random(),
			radius: random(0.4, 1.4),
			depth: random(0.2, 1)
		}));
		this.streaks = Array.from({ length: this.profile.streaks }, () =>
			this.newStreak(Math.random())
		);
		// 블랙홀 고정 부분은 12장 크기로 한 번 그려 두고, 크기가 바뀌면 늘려 그린다.
		this.blackHole.prepare(
			SCENES.m87.shadow * Math.min(this.width, this.height),
			ratio,
			this.profile.diskPieces
		);
		this.drawnRadius = null;
	}

	get framesPerSecond(): number {
		return this.profile.fps;
	}

	setScene(scene: SceneId): void {
		this.target = SCENES[scene];
		this.pulseStartedAt = this.elapsed;
	}

	setEndProgress(progress: number): void {
		this.endProgress = Math.min(1, Math.max(0, progress));
	}

	addScroll(screens: number): void {
		this.scrollBoost = Math.min(
			SCROLL_BOOST_MAX,
			this.scrollBoost + screens * SCROLL_BOOST_PER_SCREEN
		);
	}

	/** 움직이지 않는 한 장(동작 줄이기 · 저사양): 목표 값을 바로 적용해 그린다. */
	drawStill(): void {
		this.current = toMixed(this.target);
		// 정지 화면은 보간 없이 스크롤 위치에 맞는 반지름 그대로
		this.drawnRadius = this.shadowRadius();
		this.draw(0, this.drawnRadius);
	}

	/** 한 프레임 진행. seconds 는 지난 프레임과의 간격. */
	step(seconds: number): void {
		this.elapsed += seconds;
		this.ease(Math.min(1, seconds * EASE_PER_SECOND));
		this.scrollBoost *= Math.exp(-seconds * SCROLL_DECAY);
		const speed = this.current.streakSpeed * (1 + this.scrollBoost);
		for (const streak of this.streaks) {
			streak.y += speed * streak.factor * seconds;
			if (streak.y - streak.length > 1) Object.assign(streak, this.newStreak(0));
		}
		for (const star of this.stars) {
			star.y += speed * star.depth * 0.06 * seconds;
			if (star.y > 1) {
				star.y -= 1;
				star.x = Math.random();
			}
		}
		const radius = this.followRadius(seconds);
		// 블랙홀이 화면에 없으면 원반 흐름도 계산하지 않는다.
		if (radius > MIN_VISIBLE_RADIUS) this.blackHole.step(seconds);
		this.draw(this.elapsed - this.pulseStartedAt, radius);
	}

	/** 그리는 반지름을 목표 반지름 쪽으로 seconds 만큼 옮긴다(지수 감쇠). */
	private followRadius(seconds: number): number {
		const target = this.shadowRadius();
		const previous = this.drawnRadius === null ? target : this.drawnRadius;
		const follow = 1 - Math.exp(-seconds * RADIUS_FOLLOW_PER_SECOND);
		this.drawnRadius = lerp(previous, target, follow);
		return this.drawnRadius;
	}

	private newStreak(headY: number): Streak {
		return { x: Math.random(), y: headY, length: random(0.08, 0.26), factor: random(0.6, 1.4) };
	}

	private ease(ratio: number): void {
		const target = this.target;
		const current = this.current;
		current.streakWidth = lerp(current.streakWidth, target.streakWidth, ratio);
		current.streakSpeed = lerp(current.streakSpeed, target.streakSpeed, ratio);
		current.streakAlpha = lerp(current.streakAlpha, target.streakAlpha, ratio);
		current.starDensity = lerp(current.starDensity, target.starDensity, ratio);
		current.tintAlpha = lerp(current.tintAlpha, target.tintAlpha, ratio);
		current.bend = lerp(current.bend, target.bend, ratio);
		current.shadow = lerp(current.shadow, target.shadow, ratio);
		current.probe = lerp(current.probe, target.probe ? 1 : 0, ratio);
		current.tint = [
			lerp(current.tint[0], target.tint[0], ratio),
			lerp(current.tint[1], target.tint[1], ratio),
			lerp(current.tint[2], target.tint[2], ratio)
		];
	}

	private pulseAmount(sincePulse: number, kind: SceneParams['pulse']): number {
		if (this.target.pulse !== kind) return 0;
		if (kind === 'glow') {
			if (sincePulse >= GLOW_SECONDS) return 0;
			// 0.2초 안에 밝아졌다가 남은 시간 동안 멀어진다.
			return sincePulse < 0.2 ? sincePulse / 0.2 : 1 - (sincePulse - 0.2) / (GLOW_SECONDS - 0.2);
		}
		if (sincePulse >= BEND_PULSE_SECONDS) return 0;
		return Math.sin((sincePulse / BEND_PULSE_SECONDS) * Math.PI) * BEND_PULSE_AMOUNT;
	}

	private shadowRadius(): number {
		const base = this.current.shadow * Math.min(this.width, this.height);
		if (this.target !== SCENES.end) return base;
		return endShadowRadius(base, shadowCoverRadius(this.width, this.height), this.endProgress);
	}

	private draw(sincePulse: number, radius: number): void {
		const { context, width, height, current } = this;
		context.fillStyle = BACKGROUND;
		context.fillRect(0, 0, width, height);

		if (current.tintAlpha > 0.005) {
			const [red, green, blue] = current.tint.map(Math.round);
			const tint = context.createRadialGradient(
				width * 0.72,
				height * 0.3,
				0,
				width * 0.72,
				height * 0.3,
				Math.max(width, height) * 0.8
			);
			tint.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${current.tintAlpha})`);
			tint.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
			context.fillStyle = tint;
			context.fillRect(0, 0, width, height);
		}

		const glow = this.pulseAmount(sincePulse, 'glow');
		if (glow > 0) {
			const sun = context.createRadialGradient(
				width / 2,
				-height * 0.1,
				0,
				width / 2,
				-height * 0.1,
				Math.max(width, height) * 0.9
			);
			sun.addColorStop(0, `rgba(${SUN_RGB}, ${0.55 * glow})`);
			sun.addColorStop(1, `rgba(${SUN_RGB}, 0)`);
			context.fillStyle = sun;
			context.fillRect(0, 0, width, height);
		}

		const starCount = Math.round(this.stars.length * Math.min(1, current.starDensity));
		context.fillStyle = `rgba(${STAR_RGB}, 0.75)`;
		for (const star of this.stars.slice(0, starCount)) {
			context.beginPath();
			context.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
			context.fill();
		}

		const centerX = width * SHADOW_CENTER_X;
		const centerY = height * SHADOW_CENTER_Y;
		const bend = Math.min(1, current.bend + this.pulseAmount(sincePulse, 'bend'));
		context.lineCap = 'round';
		context.lineWidth = current.streakWidth;
		for (const streak of this.streaks) this.drawStreak(streak, bend, centerX, centerY, radius);

		if (current.probe > 0.01) {
			context.fillStyle = `rgba(${LIGHT_RGB}, ${current.probe})`;
			context.beginPath();
			context.arc(width * PROBE_X, height * PROBE_Y, 2.5, 0, Math.PI * 2);
			context.fill();
		}

		if (radius > MIN_VISIBLE_RADIUS) {
			this.blackHole.draw(context, centerX, centerY, radius, this.blackHoleLight());
		}
	}

	/** 그림자 밖 빛의 세기: 끝 장에서 그림자가 화면을 덮어 갈수록 줄어 마지막엔 검은 화면만 남는다. */
	private blackHoleLight(): number {
		return this.target === SCENES.end ? 1 - this.endProgress : 1;
	}

	private drawStreak(
		streak: Streak,
		bend: number,
		centerX: number,
		centerY: number,
		radius: number
	): void {
		const { context, width, height, current } = this;
		const tailX = streak.x * width;
		const tailY = (streak.y - streak.length) * height;
		const headY = streak.y * height;
		// 그림자 높이에 가까운 빛줄기일수록 그림자 쪽으로 더 휜다.
		const nearness = Math.max(0, 1 - Math.abs(headY - centerY) / (height * 0.6));
		const headX = tailX + (centerX - tailX) * bend * 0.45 * nearness;
		// 원반 · 그림자 둘레 띠에 닿은 빛줄기는 빨려 들어가 사라진다.
		if (
			radius > MIN_VISIBLE_RADIUS &&
			this.blackHole.contains(headX, headY, centerX, centerY, radius)
		) {
			return;
		}
		const inColumn = Math.abs(tailX - width / 2) < COLUMN_HALF_WIDTH_PX;
		const alpha = current.streakAlpha * (inColumn ? COLUMN_ALPHA : 1);
		const gradient = context.createLinearGradient(tailX, tailY, headX, headY);
		gradient.addColorStop(0, `rgba(${LIGHT_RGB}, 0)`);
		gradient.addColorStop(1, `rgba(${LIGHT_RGB}, ${alpha})`);
		context.strokeStyle = gradient;
		context.beginPath();
		context.moveTo(tailX, tailY);
		context.quadraticCurveTo(tailX, (tailY + headY) / 2, headX, headY);
		context.stroke();
	}
}
