// 두 언덕(3-3 · 7-5 공용, 시제품 :1950-2096): 하늘(맑음 · 비 · 노을 · 밤) · 빗줄기 · 언덕 · 집 · 이름표.
import { mulberry32 } from '../chaosCompute.ts';
import {
	css,
	drawLabel,
	isWide,
	mix,
	rgba,
	roundedRectPath,
	S,
	WHITE,
	type Rgb
} from '../chaosPaint.ts';
import { smoothstep } from '../chaosScene.ts';

type Sky = { top: Rgb; horizon: Rgb };
const SKY_CLEAR: Sky = { top: [86, 78, 58], horizon: [206, 178, 122] }; // 맑음: 옅은 금빛(따뜻한 예외)
const SKY_RAIN: Sky = { top: [28, 34, 44], horizon: [72, 84, 98] }; // 비: 푸른 회색
const SKY_DUSK: Sky = { top: [52, 36, 58], horizon: [232, 128, 74] }; // 7-5 노을(따뜻한 예외)
const SKY_NIGHT: Sky = { top: [5, 6, 11], horizon: [16, 18, 28] }; // 밤(시간이 흐른다는 표시, 3-3만)
const SUN_GLOW: Rgb = [255, 236, 190];
const DUSK_GLOW: Rgb = [255, 140, 80];
const HILL: Rgb = [16, 17, 20];
const HOUSE: Rgb = [27, 28, 32];
const RAIN_STREAK: Rgb = [172, 186, 204];
const RAIN_SEED = 1961; // 임의 고정값
const RAIN_DROP_COUNT = 90;
const RAIN_DROPS = (() => {
	const random = mulberry32(RAIN_SEED);
	return Array.from({ length: RAIN_DROP_COUNT }, () => ({
		x: random(),
		phase: random(),
		speed: 0.7 + random() * 0.6,
		length: 10 + random() * 10
	}));
})();
const HOUSE_SPOTS = [0.3, 0.35, 0.405, 0.455]; // 언덕 비탈의 집 자리(가로 비율)
const HILL_TOP_SPOT = 0.64; // 언덕 꼭대기
const HILL_POINTS = 60;

/** 맑음 정도 → 비 */
export function rainOf(clear: number): number {
	return 1 - smoothstep(0.2, 0.6, clear);
}

function hillHeight(fraction: number): number {
	return (
		0.3 * Math.exp(-(((fraction - HILL_TOP_SPOT) / 0.2) ** 2)) +
		0.12 * Math.exp(-(((fraction - 0.2) / 0.16) ** 2)) +
		0.02 * Math.sin(fraction * 9)
	);
}

export type ValleyRect = { left: number; top: number; width: number; height: number };

export function valleyRects(): [ValleyRect, ValleyRect] {
	const wide = isWide();
	const left = S.width * (wide ? 0.1 : 0.06);
	const panelWidth = S.width * (wide ? 0.8 : 0.88);
	// 휴대폰: 위 언덕이 오른쪽 위 연도 글자와 겹치지 않게 연도 아래에서 시작한다
	const panelHeight = S.height * (wide ? 0.36 : 0.4);
	const firstTop = S.height * (wide ? 0.11 : 0.085);
	return [
		{ left, top: firstTop, width: panelWidth, height: panelHeight },
		{ left, top: firstTop + panelHeight + S.height * 0.05, width: panelWidth, height: panelHeight }
	];
}

/** clear 맑음 · rain 비 · dusk 노을 · night 밤 · village 집(모두 0~1) · label 이름표 · alpha 전체 */
export type ValleyLook = {
	clear: number;
	rain: number;
	dusk: number;
	night: number;
	village: number;
	label: { text: string; alpha: number } | null;
	alpha: number;
};

export function drawValley(
	rect: ValleyRect,
	look: ValleyLook,
	seconds: number,
	alive: boolean,
	p: number
): void {
	const { clear, rain, dusk, night, village, label, alpha } = look;
	if (alpha <= 0) return;
	const context = S.context;
	const dayTop = mix(mix(SKY_RAIN.top, SKY_CLEAR.top, clear), SKY_DUSK.top, dusk);
	const dayHorizon = mix(mix(SKY_RAIN.horizon, SKY_CLEAR.horizon, clear), SKY_DUSK.horizon, dusk);
	const skyTop = mix(dayTop, SKY_NIGHT.top, night);
	const skyHorizon = mix(dayHorizon, SKY_NIGHT.horizon, night);
	const hillY = (fraction: number): number =>
		rect.top + rect.height * (0.86 - hillHeight(fraction));
	context.save();
	roundedRectPath(rect.left, rect.top, rect.width, rect.height, css(10));
	context.clip();
	context.globalCompositeOperation = 'source-over';
	const sky = context.createLinearGradient(0, rect.top, 0, rect.top + rect.height * 0.8);
	sky.addColorStop(0, rgba(skyTop, alpha));
	sky.addColorStop(1, rgba(skyHorizon, alpha));
	context.fillStyle = sky;
	context.fillRect(rect.left, rect.top, rect.width, rect.height);
	context.globalCompositeOperation = 'lighter';
	const sun = clear * (1 - dusk) * (1 - night);
	if (sun > 0) {
		const x = rect.left + rect.width * 0.76;
		const y = rect.top + rect.height * 0.28;
		const glow = context.createRadialGradient(x, y, 0, x, y, rect.height * 0.4);
		glow.addColorStop(0, rgba(SUN_GLOW, 0.35 * sun * alpha));
		glow.addColorStop(1, rgba(SUN_GLOW, 0));
		context.fillStyle = glow;
		context.fillRect(rect.left, rect.top, rect.width, rect.height);
	}
	if (dusk > 0) {
		const x = rect.left + rect.width * 0.3;
		const y = rect.top + rect.height * 0.8;
		const glow = context.createRadialGradient(x, y, 0, x, y, rect.width * 0.7);
		glow.addColorStop(0, rgba(DUSK_GLOW, 0.3 * dusk * alpha));
		glow.addColorStop(1, rgba(DUSK_GLOW, 0));
		context.fillStyle = glow;
		context.fillRect(rect.left, rect.top, rect.width, rect.height);
	}
	if (rain > 0.01) {
		// 빗줄기: 위치는 시드 고정, 떨어지는 정도는 진행값(+ 살아 있을 때 시간)
		const fall = (alive ? seconds * 1.3 : 0) + p * 4;
		context.strokeStyle = rgba(RAIN_STREAK, 0.4 * rain * alpha);
		context.lineWidth = css(1);
		context.beginPath();
		for (const drop of RAIN_DROPS) {
			const y = rect.top + ((drop.phase + fall * drop.speed) % 1) * rect.height;
			const x = rect.left + drop.x * rect.width;
			const length = css(drop.length);
			context.moveTo(x, y);
			context.lineTo(x - length * 0.25, y + length);
		}
		context.stroke();
	}
	// 언덕 · 집은 하늘을 덮는다
	context.globalCompositeOperation = 'source-over';
	context.beginPath();
	context.moveTo(rect.left, rect.top + rect.height);
	for (let k = 0; k <= HILL_POINTS; k++)
		context.lineTo(rect.left + (k / HILL_POINTS) * rect.width, hillY(k / HILL_POINTS));
	context.lineTo(rect.left + rect.width, rect.top + rect.height);
	context.closePath();
	context.fillStyle = rgba(HILL, alpha);
	context.fill();
	if (village > 0) {
		context.fillStyle = rgba(HOUSE, alpha * village);
		const size = css(9);
		for (const spot of HOUSE_SPOTS) {
			const x = rect.left + spot * rect.width;
			const y = hillY(spot) + size * 0.25;
			context.beginPath();
			context.moveTo(x - size / 2, y);
			context.lineTo(x - size / 2, y - size * 0.75);
			context.lineTo(x, y - size * 1.25);
			context.lineTo(x + size / 2, y - size * 0.75);
			context.lineTo(x + size / 2, y);
			context.closePath();
			context.fill();
		}
	}
	context.globalCompositeOperation = 'lighter';
	context.strokeStyle = rgba(skyHorizon, 0.35 * alpha);
	context.lineWidth = css(1);
	context.beginPath();
	for (let k = 0; k <= HILL_POINTS; k++)
		context.lineTo(rect.left + (k / HILL_POINTS) * rect.width, hillY(k / HILL_POINTS));
	context.stroke();
	context.restore();
	roundedRectPath(rect.left, rect.top, rect.width, rect.height, css(10));
	context.strokeStyle = rgba(WHITE, 0.08 * alpha);
	context.lineWidth = css(1);
	context.stroke();
	if (label !== null)
		drawLabel(
			label.text,
			rect.left + css(12),
			rect.top + css(16),
			11,
			WHITE,
			0.8 * label.alpha * alpha,
			{
				align: 'left'
			}
		);
}
