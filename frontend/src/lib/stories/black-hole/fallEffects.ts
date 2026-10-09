// 장마다 한 가지씩 더하는 포인트 연출(Canvas 2D). 상태 없이 프레임 값(장면 시작 뒤 지난 초 등)으로만 그린다.
// still(동작 줄이기 · 저사양)이면 연출이 끝난 모습 한 장을 그린다.
import { ringRadius, type MapLayout } from './mapLayout.ts';
import {
	FULL_TURN,
	paintInwardArrows,
	polar,
	ringPx,
	RING_RGB,
	type Point,
	type Rect,
	type View
} from './mapPaint.ts';
import type { SceneEffect } from './scenes.ts';

export type Star = { x: number; y: number; radius: number };
export type GasPiece = { radius: number; angle: number; length: number; brightness: number };

export type EffectFrame = {
	context: CanvasRenderingContext2D;
	view: View;
	layout: MapLayout;
	// 화면 전체 크기(별 · 표지 테두리)
	width: number;
	height: number;
	// 지도 구도 영역(휴대폰: 계기판 아래 전체 · PC: 오른쪽 6할 구도 영역). 연출 자리는 이 영역 기준이다.
	region: Rect;
	// 장면이 시작된 뒤 지난 초
	seconds: number;
	still: boolean;
	travelerRadius: number;
	travelerAngle: number;
	gas: GasPiece[];
	disk: number;
};

// 연출이 바꾼 여행자 자리(null 이면 기본 자리)와 세로로 늘어난 정도(1 = 점)
export type EffectResult = { traveler: Point | null; stretch: number };

const STAR_RGB = '230, 236, 255';
const GAS_RGB = '255, 210, 150';
const JET_RGB = '150, 190, 255';
const NO_CHANGE: EffectResult = { traveler: null, stretch: 1 };
// 제트 기울기(라디안)
const JET_ANGLE = -0.6;
// 3장: 원을 1바퀴 반 돌고 나선으로 안쪽 이 비율까지 미끄러지는 한 주기(초)
const SPIRAL_SECONDS = 6;
const SPIRAL_TURNS = 1.5;
const SPIRAL_INWARD_SHARE = 0.2;
const SPIRAL_STEPS = 60;
// 4장: 그림자 원이 걷히는 시간(초) · 원반 뒷면 빛이 위로 휜 띠 두께(그림자 반지름 대비)
const SHADOW_REVEAL_SECONDS = 2.5;
const LENSED_ARC_SHARE = 0.3;
// 5장: 손전등 빛이 광자구를 한 바퀴 도는 시간 · 다음 빛까지 쉬는 시간(초) · 별이 모이는 시간
const PHOTON_LOOP_SECONDS = 2.5;
const PHOTON_PAUSE_SECONDS = 1.5;
const STAR_GATHER_SECONDS = 4;
const STAR_GATHER_SHARE = 0.9;
const STAR_GATHER_Y = 0.14;
const STAR_GATHER_RADIUS_SHARE = 0.08;
// 6장: 끌려 도는 소용돌이 줄 수 · 각속도(라디안/초)
const SWIRL_LINES = 10;
const SWIRL_SPEED = 0.8;
const SWIRL_TRAVELER_SPEED = 0.3;
// 8장: 중심을 향하는 화살표 수
const INWARD_ARROWS = 12;
// 9장: 다 늘어났을 때 배수 · 늘어나는 시간(초)
const MAX_STRETCH = 8;
const STRETCH_SECONDS = 3;
// 10장: 세 갈래 상상 줄의 방향(라디안)
const THREE_STORIES = [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6];
// 11장: 먼 곳의 흰 깜빡임 자리(화면 비율)와 나타나기 시작하는 때(초)
const WHITE_HOLE_X = 0.78;
const WHITE_HOLE_Y = 0.24;
const WHITE_HOLE_DELAY_SECONDS = 2;

function progress(frame: EffectFrame, duration: number): number {
	return frame.still ? 1 : Math.min(1, frame.seconds / duration);
}

function glowDot(
	context: CanvasRenderingContext2D,
	at: Point,
	radius: number,
	rgb: string,
	alpha: number
): void {
	const glow = context.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
	glow.addColorStop(0, `rgba(${rgb}, ${alpha})`);
	glow.addColorStop(1, `rgba(${rgb}, 0)`);
	context.fillStyle = glow;
	context.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
}

/** 별 입자. 5장에서는 머리 위 작은 원 하나로 모여든다. */
export function paintStars(
	frame: EffectFrame,
	stars: Star[],
	alpha: number,
	effect: SceneEffect
): void {
	if (alpha < 0.01) return;
	const { context, width, height, region } = frame;
	const gather = effect === 'photon-loop' ? progress(frame, STAR_GATHER_SECONDS) : 0;
	const gatherRadius = Math.min(region.width, region.height) * STAR_GATHER_RADIUS_SHARE;
	context.fillStyle = `rgba(${STAR_RGB}, ${0.75 * alpha})`;
	for (const star of stars) {
		const free = { x: star.x * width, y: star.y * height };
		const packed = {
			x: region.x + region.width / 2 + (star.x - 0.5) * gatherRadius * 2,
			y: region.y + region.height * STAR_GATHER_Y + (star.y - 0.5) * gatherRadius * 2
		};
		const ratio = gather * STAR_GATHER_SHARE;
		context.beginPath();
		context.arc(
			free.x + (packed.x - free.x) * ratio,
			free.y + (packed.y - free.y) * ratio,
			star.radius,
			0,
			FULL_TURN
		);
		context.fill();
	}
}

/** 강착 원반 가스: 띠를 따라 도는 호 조각 */
function paintGas(frame: EffectFrame): void {
	if (frame.disk < 0.01) return;
	const { context, view } = frame;
	context.save();
	context.lineCap = 'round';
	context.lineWidth = 1.6;
	for (const piece of frame.gas) {
		context.strokeStyle = `rgba(${GAS_RGB}, ${frame.disk * piece.brightness * 0.8})`;
		context.beginPath();
		context.arc(
			view.center.x,
			view.center.y,
			ringPx(view, piece.radius),
			piece.angle,
			piece.angle + piece.length
		);
		context.stroke();
	}
	context.restore();
}

/** 1장: 블랙홀 가운데를 지나 화면을 가로지르는 제트 */
function paintJet(frame: EffectFrame): void {
	const { context, view, width, height } = frame;
	const reach = Math.hypot(width, height);
	const alpha = progress(frame, 1);
	const dx = Math.cos(JET_ANGLE) * reach;
	const dy = Math.sin(JET_ANGLE) * reach;
	const beam = context.createLinearGradient(
		view.center.x - dx,
		view.center.y - dy,
		view.center.x + dx,
		view.center.y + dy
	);
	beam.addColorStop(0, `rgba(${JET_RGB}, 0)`);
	beam.addColorStop(0.5, `rgba(${JET_RGB}, ${0.8 * alpha})`);
	beam.addColorStop(1, `rgba(${JET_RGB}, 0)`);
	context.save();
	context.strokeStyle = beam;
	context.lineWidth = 3;
	context.lineCap = 'round';
	context.beginPath();
	context.moveTo(view.center.x - dx, view.center.y - dy);
	context.lineTo(view.center.x + dx, view.center.y + dy);
	context.stroke();
	context.restore();
}

function spiralPoint(frame: EffectFrame, isco: number, share: number): Point {
	const angle = frame.travelerAngle + share * SPIRAL_TURNS * FULL_TURN;
	// 앞 1/3 은 원, 나머지는 안쪽으로 미끄러지는 나선
	const slide = Math.max(0, (share - 1 / 3) / (2 / 3));
	return polar(frame.view, isco * (1 - SPIRAL_INWARD_SHARE * slide ** 1.5), angle);
}

/** 3장: 원 궤도 → 나선. 지나온 길을 선으로 남긴다. */
function paintSpiral(frame: EffectFrame): EffectResult {
	const { context } = frame;
	const isco = ringRadius(frame.layout, 'isco');
	const share = frame.still ? 1 : (frame.seconds % SPIRAL_SECONDS) / SPIRAL_SECONDS;
	context.save();
	context.strokeStyle = `rgba(${RING_RGB.isco}, 0.7)`;
	context.lineWidth = 1.5;
	context.setLineDash([3, 4]);
	context.beginPath();
	const steps = Math.max(1, Math.round(SPIRAL_STEPS * share));
	for (let index = 0; index <= steps; index += 1) {
		const point = spiralPoint(frame, isco, (share * index) / steps);
		if (index === 0) context.moveTo(point.x, point.y);
		else context.lineTo(point.x, point.y);
	}
	context.stroke();
	context.restore();
	return { traveler: spiralPoint(frame, isco, share), stretch: 1 };
}

/** 4장: 그림자 원이 겹쳤다가 걷혀 안쪽 지평선이 드러나고, 뒤쪽 원반 빛이 그림자 위로 휜다. */
function paintShadowReveal(frame: EffectFrame): void {
	const { context, view } = frame;
	const shadowPx = ringPx(view, ringRadius(frame.layout, 'shadow'));
	const cover = 1 - progress(frame, SHADOW_REVEAL_SECONDS);
	if (cover > 0.01) {
		context.fillStyle = `rgba(0, 0, 0, ${cover})`;
		context.beginPath();
		context.arc(view.center.x, view.center.y, shadowPx, 0, FULL_TURN);
		context.fill();
	}
	const arc = context.createRadialGradient(
		view.center.x,
		view.center.y,
		shadowPx,
		view.center.x,
		view.center.y,
		shadowPx * (1 + LENSED_ARC_SHARE)
	);
	arc.addColorStop(0, `rgba(${GAS_RGB}, 0.55)`);
	arc.addColorStop(1, `rgba(${GAS_RGB}, 0)`);
	context.fillStyle = arc;
	context.beginPath();
	context.arc(view.center.x, view.center.y, shadowPx * (1 + LENSED_ARC_SHARE), Math.PI, FULL_TURN);
	context.arc(view.center.x, view.center.y, shadowPx, FULL_TURN, Math.PI, true);
	context.closePath();
	context.fill();
}

/** 5장: 옆으로 비춘 손전등 빛이 광자구를 한 바퀴 돌아 여행자에게 돌아온다. */
function paintPhotonLoop(frame: EffectFrame): void {
	const { context, view } = frame;
	const photon = ringRadius(frame.layout, 'photon_sphere');
	const cycle = PHOTON_LOOP_SECONDS + PHOTON_PAUSE_SECONDS;
	const share = frame.still ? 1 : Math.min(1, (frame.seconds % cycle) / PHOTON_LOOP_SECONDS);
	const start = frame.travelerAngle;
	context.save();
	context.strokeStyle = `rgba(${RING_RGB.photon_sphere}, 0.9)`;
	context.lineWidth = 2;
	context.beginPath();
	context.arc(view.center.x, view.center.y, ringPx(view, photon), start, start + share * FULL_TURN);
	context.stroke();
	context.restore();
	if (share < 1) {
		glowDot(context, polar(view, photon, start + share * FULL_TURN), 8, RING_RGB.photon_sphere, 1);
	}
}

/** 6장: 띠 전체가 소용돌이로 끌려 돈다. 여행자도 함께 돈다. */
function paintSwirl(frame: EffectFrame): EffectResult {
	const { context, view } = frame;
	const outer = ringRadius(frame.layout, 'photon_sphere');
	const inner = ringRadius(frame.layout, 'horizon');
	const turn = frame.still ? 0 : frame.seconds * SWIRL_SPEED;
	context.save();
	context.strokeStyle = `rgba(${RING_RGB.ergosphere}, 0.7)`;
	context.lineWidth = 1.5;
	for (let line = 0; line < SWIRL_LINES; line += 1) {
		const base = (line / SWIRL_LINES) * FULL_TURN + turn;
		context.beginPath();
		for (let index = 0; index <= 12; index += 1) {
			const share = index / 12;
			const point = polar(view, outer + (inner - outer) * share, base + share * 1.2);
			if (index === 0) context.moveTo(point.x, point.y);
			else context.lineTo(point.x, point.y);
		}
		context.stroke();
	}
	context.restore();
	const drift = frame.still ? 0 : frame.seconds * SWIRL_TRAVELER_SPEED;
	return {
		traveler: polar(view, frame.travelerRadius, frame.travelerAngle + drift),
		stretch: 1
	};
}

/** 10장: 중심 흰 점과 세 갈래 상상 줄 */
function paintSingularity(frame: EffectFrame): void {
	const { context, view, region } = frame;
	const length = Math.min(region.width, region.height) * 0.3;
	glowDot(context, view.center, 40, '255, 255, 255', 0.9);
	context.save();
	context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
	context.setLineDash([4, 6]);
	for (const angle of THREE_STORIES) {
		const end = {
			x: view.center.x + Math.cos(angle) * length,
			y: view.center.y + Math.sin(angle) * length
		};
		context.beginPath();
		context.moveTo(view.center.x, view.center.y);
		context.lineTo(end.x, end.y);
		context.stroke();
		glowDot(context, end, 6, '255, 255, 255', 0.6);
	}
	context.restore();
}

/** 11장: 빈 창. 먼 곳에서 흰 깜빡임 하나가 1초에 한 번. */
function paintWhiteHole(frame: EffectFrame): void {
	const { context, region } = frame;
	if (!frame.still && frame.seconds < WHITE_HOLE_DELAY_SECONDS) return;
	const phase = frame.seconds % 1;
	const on = frame.still ? 1 : phase < 0.25 ? 1 - phase / 0.25 : 0;
	if (on <= 0) return;
	const at = {
		x: region.x + region.width * WHITE_HOLE_X,
		y: region.y + region.height * WHITE_HOLE_Y
	};
	glowDot(context, at, 14, '255, 255, 255', on);
}

/** 표지: 2편 끝처럼 화면을 다 덮은 그림자. 가장자리에만 빛 고리가 살짝 남는다. */
function paintCover(frame: EffectFrame): void {
	const { context, width, height } = frame;
	const radius = Math.hypot(width, height) / 2;
	const rim = context.createRadialGradient(
		width / 2,
		height / 2,
		radius * 0.8,
		width / 2,
		height / 2,
		radius * 1.05
	);
	rim.addColorStop(0, 'rgba(255, 196, 128, 0)');
	rim.addColorStop(1, 'rgba(255, 196, 128, 0.22)');
	context.fillStyle = rim;
	context.fillRect(0, 0, width, height);
}

export function paintEffect(frame: EffectFrame, effect: SceneEffect): EffectResult {
	paintGas(frame);
	switch (effect) {
		case 'none':
			paintCover(frame);
			return NO_CHANGE;
		case 'jet':
			paintJet(frame);
			return NO_CHANGE;
		case 'disk':
			return NO_CHANGE;
		case 'spiral':
			return paintSpiral(frame);
		case 'shadow-reveal':
			paintShadowReveal(frame);
			return NO_CHANGE;
		case 'photon-loop':
			paintPhotonLoop(frame);
			return NO_CHANGE;
		case 'swirl':
			return paintSwirl(frame);
		case 'signal':
			// 7장 신호 띠 · 여행자 손전등 설명은 fallRenderer 가 지도 위에 따로 그린다(signalBand.ts).
			return NO_CHANGE;
		case 'inside':
			paintInwardArrows(
				frame.context,
				frame.view,
				Math.min(frame.region.width, frame.region.height) * 0.42,
				INWARD_ARROWS,
				0.7
			);
			return NO_CHANGE;
		case 'stretch':
			return { traveler: null, stretch: 1 + (MAX_STRETCH - 1) * progress(frame, STRETCH_SECONDS) };
		case 'singularity':
			paintSingularity(frame);
			return NO_CHANGE;
		case 'white-hole':
			paintWhiteHole(frame);
			return NO_CHANGE;
	}
}
