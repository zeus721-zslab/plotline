// 사건의 지평선 너머 배경(Canvas 2D): 우주 배경 위 블랙홀 단면 동심원 지도. 장마다 카메라가 중심으로(로그 비율) 다가가고,
// 여행자 점에서 위쪽 우리에게 깜빡임 빛이 올라간다. 장마다 포인트 연출(fallEffects.ts)을 한 가지씩 더한다.
// 장이 바뀌면 카메라 · 띠 강조 · 여행자 자리는 스크롤 진행도(setProgress, 장 앞 빈 장면 구간)를 따라 앞 장 값에서 새 장 값으로 옮겨 간다.
// 두 장 이상 한 번에 건너뛰면(위치 복원 · 빠른 스크롤) 옮겨 가기 없이 새 장 값으로 바로 놓는다.
// 지도는 계기판 아래 화면 전체 폭에 그린다. 크기 · 초점 자리는 구도 영역 기준이다: 휴대폰은 계기판 아래 전체(3~6장은 초점을
// 계기판 바로 아래로, 7장은 신호 띠 바로 아래로), PC(1024px 이상)는 최대 1600px 구도의 오른쪽 6할 영역(초점은 가운데 선 쪽)이고,
// PC 왼쪽 카드 쪽은 화면 왼쪽 끝 → 가운데 선으로 옅어지는 어두운 그늘을 덮는다. 7장은 계기판 아래 신호 띠(signalBand.ts)를 더한다.
// 기기별 상한(입자 수 · 프레임 · 픽셀 배율)과 저사양 판정은 2편 배경과 같은 기준을 쓴다.
import { pickProfile, type RenderProfile } from '../light-age/skyRenderer.ts';
import {
	paintEffect,
	paintStars,
	type EffectFrame,
	type GasPiece,
	type Star
} from './fallEffects.ts';
import { placeRadius, ringRadius, type MapLayout } from './mapLayout.ts';
import {
	FULL_TURN,
	paintMap,
	paintTag,
	paintTraveler,
	polar,
	ringPx,
	tagWidth,
	type Point,
	type Rect,
	type View
} from './mapPaint.ts';
import { SCENES, type SceneId, type SceneParams } from './scenes.ts';
import { SIGNAL_BAND_PX, SignalBand, type SignalReading } from './signalBand.ts';

export { isLowEndDevice } from '../light-age/skyRenderer.ts';

const BACKGROUND_RGB: [number, number, number] = [3, 4, 10];
const INSIDE_RGB: [number, number, number] = [46, 6, 8];
// 스크롤 진행도가 정한 값으로 화면 값이 따라가는 빠르기(초당 비율). 스크롤이 뚝뚝 끊겨도 카메라가 튀지 않게 하는 정도만 둔다.
const SMOOTH_PER_SECOND = 6;
// 계기판 높이(GaugeBar.svelte .gauge height 와 같은 값). 지도 영역은 그 아래부터.
const GAUGE_PX = 48;
// 이 폭부터 좌우 분할(BlackHolePage.svelte 의 1024px 미디어 쿼리와 같은 값)
const SPLIT_MIN_WIDTH_PX = 1024;
// PC 구도: 최대 폭(카드 · 지도 초점 자리 계산에만 쓰고, 지도는 그 바깥까지 그린다) · 왼쪽 카드 열 비율(4:6). BlackHolePage.svelte .chapter · .card 와 같은 값
const COMPOSITION_MAX_PX = 1600;
const CARD_COLUMN_SHARE = 0.4;
// PC: 지도 초점 x 를 오른쪽 영역 폭의 이 비율(가운데 선 쪽)에 둔다.
const DESKTOP_FOCUS_X_SHARE = 0.38;
// 휴대폰: 초점(지금 띠 위쪽 호 · 여행자)을 지도 영역 위에서 이 비율 높이에 둔다.
const MOBILE_FOCUS_SHARE = 0.3;
// 휴대폰 3~6장: 카드(곁들임 포함 최대 약 610px)가 화면 가운데에 와도 초점이 카드 윗변보다 위에 남도록 계기판 바로 아래로 올린다.
const MOBILE_RAISED_FOCUS_SHARE = 0.06;
const RAISED_FOCUS_SCENES: ReadonlySet<SceneId> = new Set<SceneId>([
	'isco',
	'shadow',
	'photon-sphere',
	'ergosphere'
]);
// 휴대폰 7장: 초점(지평선 위쪽 호)을 신호 띠 아랫변에서 이만큼(px) 아래에 둔다. 이름표가 띠와 겹치지 않는 만큼만 띄운다.
const SIGNAL_FOCUS_INSET_PX = 30;
// 7장 여행자 점 옆 글 · 점과의 간격 · 화면 가장자리 여백 · 글 절반 높이(px)
const TRAVELER_TAG = '여행자의 손전등 · 1초에 한 번';
const TRAVELER_TAG_GAP_PX = 12;
const TRAVELER_TAG_EDGE_PX = 16;
const TRAVELER_TAG_HALF_PX = 8;
// PC 카드 쪽 그늘: 화면 왼쪽 끝(0) → 가운데 선(1) 사이 위치별 짙기(바탕색 기준)
const CARD_SHADE_STOPS: ReadonlyArray<[number, number]> = [
	[0, 0.9],
	[0.7, 0.55],
	[1, 0]
];
// 이름표가 지도 영역 윗변에 붙지 않게 띄우는 간격(px)
const LABEL_INSET_PX = 16;
// 여행자는 지도 오른쪽 위(우리에게 가는 빛이 위로 올라가게)
const TRAVELER_ANGLE = -Math.PI / 3;
// 손전등 깜빡임: 1초마다, 켜진 뒤 이 시간 동안 사그라든다
const BLINK_SECONDS = 0.18;
const BLINK_PERIOD_SECONDS = 1;
// 우리에게 가는 빛 조각이 올라가는 빠르기(화면 높이 / 초)
const PULSE_SPEED = 0.45;
// 강착 원반 가스: 안정 궤도부터 이 배수까지, 안쪽 각속도(라디안/초)는 반지름^1.5 에 반비례해 바깥이 느리다
const GAS_OUTER_SHARE = 2.8;
const GAS_INNER_SPEED = 0.9;
const GAS_ORBIT_POWER = 1.5;
// 정지 화면은 연출이 끝난 모습으로 그린다(초)
const STILL_SECONDS = 30;

type Mixed = {
	logView: number;
	logTraveler: number;
	travelerAlpha: number;
	mapAlpha: number;
	stars: number;
	disk: number;
	redness: number;
	// 휴대폰 초점 높이(지도 영역 비율)와 그 아래로 더 내리는 px(7장 신호 띠 자리)
	focusShare: number;
	focusInsetPx: number;
	// 7장 신호 띠 · 여행자 손전등 글이 보이는 정도(0~1)
	signal: number;
	flashInterval: number;
	flashRgb: [number, number, number];
	flashAlpha: number;
};

function lerp(from: number, to: number, ratio: number): number {
	return from + (to - from) * ratio;
}

function random(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function mixMixed(from: Mixed, to: Mixed, ratio: number): Mixed {
	return {
		logView: lerp(from.logView, to.logView, ratio),
		logTraveler: lerp(from.logTraveler, to.logTraveler, ratio),
		travelerAlpha: lerp(from.travelerAlpha, to.travelerAlpha, ratio),
		mapAlpha: lerp(from.mapAlpha, to.mapAlpha, ratio),
		stars: lerp(from.stars, to.stars, ratio),
		disk: lerp(from.disk, to.disk, ratio),
		redness: lerp(from.redness, to.redness, ratio),
		focusShare: lerp(from.focusShare, to.focusShare, ratio),
		focusInsetPx: lerp(from.focusInsetPx, to.focusInsetPx, ratio),
		signal: lerp(from.signal, to.signal, ratio),
		flashInterval: lerp(from.flashInterval, to.flashInterval, ratio),
		flashRgb: mixColor(from.flashRgb, to.flashRgb, ratio),
		flashAlpha: lerp(from.flashAlpha, to.flashAlpha, ratio)
	};
}

function mixColor(
	from: [number, number, number],
	to: [number, number, number],
	ratio: number
): [number, number, number] {
	return [lerp(from[0], to[0], ratio), lerp(from[1], to[1], ratio), lerp(from[2], to[2], ratio)];
}

/** 지도가 보이는 장면인가(표지 · 끝 장은 빈 화면) */
function showsMap(params: SceneParams): boolean {
	return params.effect !== 'none' && params.effect !== 'white-hole';
}

export class FallRenderer {
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private profile: RenderProfile;
	private width = 0;
	private height = 0;
	private layout: MapLayout;
	private sceneId: SceneId;
	private target: SceneParams;
	// 장이 바뀐 순간의 화면 값(옮겨 가기 출발점)과 스크롤 진행도(0~1)
	private from: Mixed;
	private progress = 1;
	// 7장 신호 띠 깜빡임이 사라진 정도(0~1, 페이지가 장면 구간 스크롤 위치로 계산)
	private fade = 1;
	private readonly signalBand = new SignalBand();
	private current: Mixed;
	private stars: Star[] = [];
	private gas: GasPiece[] = [];
	// 우리에게 가는 빛 조각의 나이(초)
	private pulses: number[] = [];
	private sincePulse = 0;
	private elapsed = 0;
	private sceneStartedAt = 0;

	constructor(canvas: HTMLCanvasElement, scene: SceneId, layout: MapLayout) {
		this.canvas = canvas;
		const context = canvas.getContext('2d');
		if (context === null) throw new Error('canvas 2d context unavailable');
		this.context = context;
		this.layout = layout;
		this.sceneId = scene;
		this.target = SCENES[scene];
		this.current = this.mixedFor(scene);
		this.from = this.current;
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
		this.stars = Array.from({ length: this.profile.stars }, () => ({
			x: Math.random(),
			y: Math.random(),
			radius: random(0.4, 1.4)
		}));
		const isco = ringRadius(this.layout, 'isco');
		this.gas = Array.from({ length: this.profile.diskPieces }, () => ({
			radius: isco * (1 + (GAS_OUTER_SHARE - 1) * Math.random() ** 1.6),
			angle: random(0, FULL_TURN),
			length: random(0.12, 0.4),
			brightness: random(0.4, 1)
		}));
	}

	/** instant 면(두 장 이상 건너뜀) 옮겨 가기 없이 새 장 값으로 바로 놓는다. */
	setScene(scene: SceneId, instant: boolean): void {
		if (scene === this.sceneId) return;
		this.sceneId = scene;
		this.target = SCENES[scene];
		if (instant) this.current = this.mixedFor(scene);
		this.from = { ...this.current, flashRgb: [...this.current.flashRgb] };
		this.sceneStartedAt = this.elapsed;
		if (this.target.effect === 'signal') this.signalBand.reset();
	}

	/** 새 장으로 옮겨 간 정도(0~1). 페이지가 장 앞 빈 장면 구간의 스크롤 위치로 계산해 넘긴다. */
	setProgress(progress: number): void {
		this.progress = Math.min(1, Math.max(0, progress));
	}

	/** 7장 신호 띠 깜빡임이 사라진 정도(0~1). 정지 화면은 이 값과 무관하게 사라지기까지의 전체 모습이다. */
	setFade(fade: number): void {
		this.fade = Math.min(1, Math.max(0, fade));
	}

	/** 움직이지 않는 한 장(동작 줄이기 · 저사양): 목표 값을 바로 적용하고 연출이 끝난 모습으로 그린다. */
	drawStill(): void {
		this.current = this.mixedFor(this.sceneId);
		this.draw(STILL_SECONDS, true);
	}

	/** 한 프레임 진행. seconds 는 지난 프레임과의 간격. */
	step(seconds: number): void {
		this.elapsed += seconds;
		this.ease(Math.min(1, seconds * SMOOTH_PER_SECOND));
		this.moveGas(seconds);
		this.movePulses(seconds);
		this.signalBand.step(seconds, this.fade, this.target.effect === 'signal');
		this.draw(this.elapsed - this.sceneStartedAt, false);
	}

	private mixedFor(scene: SceneId): Mixed {
		const params = SCENES[scene];
		const flash = params.flash;
		return {
			logView: Math.log(placeRadius(this.layout, params.view)),
			logTraveler: Math.log(
				params.traveler === null ? 1 : placeRadius(this.layout, params.traveler)
			),
			travelerAlpha: params.traveler === null ? 0 : 1,
			mapAlpha: showsMap(params) ? 1 : 0,
			stars: params.stars,
			disk: params.disk,
			redness: params.redness,
			...this.focusFor(scene, params),
			signal: params.effect === 'signal' ? 1 : 0,
			flashInterval: flash === null ? 1 : flash.interval,
			flashRgb: flash === null ? [255, 255, 255] : [...flash.rgb],
			flashAlpha: flash === null ? 0 : flash.alpha
		};
	}

	/** 휴대폰 초점 높이: 3~6장은 계기판 바로 아래, 7장은 신호 띠 바로 아래, 나머지는 위쪽 약 1/3 */
	private focusFor(
		scene: SceneId,
		params: SceneParams
	): Pick<Mixed, 'focusShare' | 'focusInsetPx'> {
		if (params.effect === 'signal') {
			return { focusShare: 0, focusInsetPx: SIGNAL_BAND_PX + SIGNAL_FOCUS_INSET_PX };
		}
		const raised = RAISED_FOCUS_SCENES.has(scene);
		return { focusShare: raised ? MOBILE_RAISED_FOCUS_SHARE : MOBILE_FOCUS_SHARE, focusInsetPx: 0 };
	}

	/** 지금 진행도에서 화면이 가야 할 값: 출발점과 새 장 값 사이. 여행자 · 깜빡임이 없는 장면이면 자리 · 색은 출발점 그대로 둔다. */
	private goal(): Mixed {
		const to = this.mixedFor(this.sceneId);
		if (this.target.traveler === null) to.logTraveler = this.from.logTraveler;
		if (this.target.flash === null) {
			to.flashInterval = this.from.flashInterval;
			to.flashRgb = this.from.flashRgb;
		}
		return mixMixed(this.from, to, this.progress);
	}

	private ease(ratio: number): void {
		this.current = mixMixed(this.current, this.goal(), ratio);
	}

	private moveGas(seconds: number): void {
		if (this.current.disk < 0.01) return;
		const isco = ringRadius(this.layout, 'isco');
		for (const piece of this.gas) {
			piece.angle += GAS_INNER_SPEED * (isco / piece.radius) ** GAS_ORBIT_POWER * seconds;
			if (piece.angle > FULL_TURN) piece.angle -= FULL_TURN;
		}
	}

	/** 우리에게 가는 빛 조각: 지금 간격마다 하나씩 생겨 위로 올라가고, 화면 위로 나가면 지운다. */
	private movePulses(seconds: number): void {
		this.pulses = this.pulses.map((age) => age + seconds).filter((age) => age * PULSE_SPEED < 1);
		this.sincePulse += seconds;
		if (this.target.flash !== null && this.sincePulse >= this.current.flashInterval) {
			this.sincePulse = 0;
			this.pulses.push(0);
		}
	}

	private get desktop(): boolean {
		return this.width >= SPLIT_MIN_WIDTH_PX;
	}

	/** 지도 구도 영역(크기 · 초점 자리 기준): 휴대폰은 계기판 아래 전체, PC 는 가운데 정렬 구도(최대 1600px)의 오른쪽 6할.
	 * 지도는 이 영역 밖(PC 왼쪽 · 오른쪽 바깥)까지 화면 전체 폭에 그린다. */
	private region(): Rect {
		const top = GAUGE_PX;
		const height = this.height - GAUGE_PX;
		if (!this.desktop) return { x: 0, y: top, width: this.width, height };
		const composition = Math.min(this.width, COMPOSITION_MAX_PX);
		const middleLine = (this.width - composition) / 2 + composition * CARD_COLUMN_SHARE;
		return { x: middleLine, y: top, width: composition * (1 - CARD_COLUMN_SHARE), height };
	}

	/** 초점 x: 휴대폰은 영역 가운데, PC 는 가운데 선 쪽 */
	private focusX(area: Rect): number {
		return area.x + area.width * (this.desktop ? DESKTOP_FOCUS_X_SHARE : 0.5);
	}

	private view(area: Rect): View {
		const unitPx = Math.min(area.width, area.height) / 2 / Math.exp(this.current.logView);
		const travelerPx = Math.exp(this.current.logTraveler) * unitPx;
		const middleY = area.y + area.height / 2;
		// 휴대폰: 여행자(지금 띠 위)가 영역 위에서 focusShare 높이(+ 7장 신호 띠 자리)에 오도록 중심을 내린다. 여행자가 없는 장면은 영역 가운데.
		const restingY = this.desktop
			? middleY
			: lerp(
					middleY,
					area.y + area.height * this.current.focusShare + this.current.focusInsetPx + travelerPx,
					this.current.travelerAlpha
				);
		return { center: { x: this.focusX(area), y: restingY }, unitPx };
	}

	private backgroundRgb(): number[] {
		return mixColor(BACKGROUND_RGB, INSIDE_RGB, this.current.redness).map(Math.round);
	}

	private paintBackground(): void {
		const [red, green, blue] = this.backgroundRgb();
		this.context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
		this.context.fillRect(0, 0, this.width, this.height);
	}

	/** PC 카드 쪽 그늘: 화면 왼쪽 끝에서 가운데 선(구도 영역 왼쪽)으로 옅어진다. 카드 글이 잘 읽히고 왼쪽 바깥 지도가 흐려진다. */
	private paintCardShade(region: Rect): void {
		const { context } = this;
		const [red, green, blue] = this.backgroundRgb();
		const shade = context.createLinearGradient(0, 0, region.x, 0);
		for (const [offset, alpha] of CARD_SHADE_STOPS) {
			shade.addColorStop(offset, `rgba(${red}, ${green}, ${blue}, ${alpha})`);
		}
		context.fillStyle = shade;
		context.fillRect(0, 0, region.x, this.height);
	}

	private blink(seconds: number, still: boolean): number {
		if (still) return 1;
		const phase = seconds % BLINK_PERIOD_SECONDS;
		return phase < BLINK_SECONDS ? 1 - phase / BLINK_SECONDS : 0;
	}

	private paintPulses(from: Point, still: boolean): void {
		const { context, current } = this;
		if (current.flashAlpha < 0.01) return;
		// 정지 화면은 간격만큼 벌어진 빛 조각 세 개를 그대로 둔다.
		const ages = still
			? [0.3, 0.3 + current.flashInterval * 0.5, 0.3 + current.flashInterval]
			: this.pulses;
		const [red, green, blue] = current.flashRgb.map(Math.round);
		for (const age of ages) {
			const y = from.y - age * PULSE_SPEED * this.height;
			if (y < 0) continue;
			const glow = context.createRadialGradient(from.x, y, 0, from.x, y, 8);
			glow.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${current.flashAlpha})`);
			glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
			context.fillStyle = glow;
			context.fillRect(from.x - 8, y - 8, 16, 16);
		}
	}

	private draw(seconds: number, still: boolean): void {
		const { context, current } = this;
		const region = this.region();
		const view = this.view(region);
		this.paintBackground();
		const travelerRadius = Math.exp(current.logTraveler);
		const frame: EffectFrame = {
			context,
			view,
			layout: this.layout,
			width: this.width,
			height: this.height,
			region,
			seconds,
			still,
			travelerRadius,
			travelerAngle: TRAVELER_ANGLE,
			gas: this.gas,
			disk: current.disk
		};
		paintStars(frame, this.stars, current.stars, this.target.effect);
		// 표지의 가장자리 빛만 화면 전체에 그리고, 지도 · 연출 · 여행자는 계기판 아래(화면 전체 폭)로만 그린다.
		const clipped = this.target.effect !== 'none';
		context.save();
		if (clipped) {
			context.beginPath();
			context.rect(0, GAUGE_PX, this.width, this.height - GAUGE_PX);
			context.clip();
		}
		const labelY = paintMap(
			context,
			view,
			this.layout,
			this.target.focus,
			current.mapAlpha,
			region.y + LABEL_INSET_PX
		);
		const effect = paintEffect(frame, this.target.effect);
		const traveler = this.paintTravelerAt(
			effect.traveler,
			effect.stretch,
			view,
			travelerRadius,
			seconds,
			still
		);
		context.restore();
		if (this.desktop) this.paintCardShade(region);
		const travelerTag = traveler === null ? null : this.paintTravelerTag(traveler);
		const signal = this.paintSignal(region, still);
		this.markFocus(region, view, labelY, traveler, travelerTag, signal);
	}

	/** 7장 여행자 점 옆 글. 오른쪽에 자리가 없으면 왼쪽에 둔다. 그린 글 자리를 돌려준다. */
	private paintTravelerTag(at: Point): Rect | null {
		const alpha = this.current.signal * this.current.travelerAlpha;
		if (alpha < 0.01) return null;
		const width = tagWidth(this.context, TRAVELER_TAG);
		const rightSide = at.x + TRAVELER_TAG_GAP_PX;
		const x =
			rightSide + width <= this.width - TRAVELER_TAG_EDGE_PX
				? rightSide
				: at.x - TRAVELER_TAG_GAP_PX - width;
		const y = at.y - TRAVELER_TAG_HALF_PX;
		paintTag(this.context, TRAVELER_TAG, x, y, alpha);
		return { x, y, width, height: TRAVELER_TAG_HALF_PX * 2 };
	}

	/** 7장 신호 띠: 계기판 바로 아래, 휴대폰은 화면 폭 · PC 는 지도 쪽 구도 영역 폭. 7장을 떠나는 중에는 평평해진 모습으로 사라진다. */
	private paintSignal(region: Rect, still: boolean): SignalReading | null {
		if (this.current.signal < 0.01) return null;
		const fade = still || this.target.effect !== 'signal' ? 1 : this.fade;
		const band = { x: region.x, y: GAUGE_PX, width: region.width, height: SIGNAL_BAND_PX };
		return this.signalBand.paint(this.context, band, this.current.signal, fade, still);
	}

	/** 화면 확인용 표시(data-focus): 초점 · 신호 띠 자리와 값(렌더러 좌표 CSS px). 값이 바뀔 때만 쓴다. */
	private markFocus(
		region: Rect,
		view: View,
		labelY: number | null,
		traveler: Point | null,
		travelerTag: Rect | null,
		signal: SignalReading | null
	): void {
		const focus = this.target.focus === null ? undefined : this.layout.get(this.target.focus);
		const marks = {
			centerX: Math.round(view.center.x),
			arcY: focus === undefined ? null : Math.round(view.center.y - ringPx(view, focus.radius)),
			labelY: labelY === null ? null : Math.round(labelY),
			travelerX: traveler === null ? null : Math.round(traveler.x),
			travelerY: traveler === null ? null : Math.round(traveler.y),
			tagLeft: travelerTag === null ? null : Math.round(travelerTag.x),
			tagRight: travelerTag === null ? null : Math.round(travelerTag.x + travelerTag.width),
			tagBottom: travelerTag === null ? null : Math.round(travelerTag.y + travelerTag.height),
			mapLeft: Math.round(region.x),
			mapRight: Math.round(region.x + region.width),
			signalAlpha: Math.round(this.current.signal * 100) / 100,
			signalTop: signal === null ? null : Math.round(signal.top),
			signalBottom: signal === null ? null : Math.round(signal.bottom),
			signalInterval: signal === null ? null : signal.interval,
			signalRgb: signal === null ? null : signal.rgb.join(','),
			signalFlat: signal === null ? null : signal.flat
		};
		const text = JSON.stringify(marks);
		if (this.canvas.dataset.focus !== text) this.canvas.dataset.focus = text;
	}

	private paintTravelerAt(
		moved: Point | null,
		stretch: number,
		view: View,
		travelerRadius: number,
		seconds: number,
		still: boolean
	): Point | null {
		const { context, current } = this;
		if (current.travelerAlpha < 0.01) return null;
		const at = moved === null ? polar(view, travelerRadius, TRAVELER_ANGLE) : moved;
		context.save();
		context.globalAlpha = current.travelerAlpha;
		this.paintPulses(at, still);
		paintTraveler(context, at, stretch, this.blink(seconds, still));
		context.restore();
		return at;
	}
}
