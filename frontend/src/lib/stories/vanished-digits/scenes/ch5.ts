// 5장 「먼저 넘어진 사람」(시제품 :2289-2459): 별밭에 세 천체가 켜지고(5-1) 서로 끌며 돈다(5-2) · 등잔 아래 펜이 멈춘 자리와 모이는 종이(5-3) ·
// 1e-6 만 다른 두 계산이 갈라지고 2장의 두 날씨가 겹친다(5-4). 세 천체 계산은 유휴 시간에 미리 해 둔 결과를 쓴다(chaosWorld).
import { BODY_SAMPLE_TIME, BODY_Z, mulberry32, WEATHER_DAYS } from '../chaosCompute.ts';
import {
	addTrail,
	applyBloom,
	css,
	drawRippleAt,
	drawSprite,
	flushTrails,
	GOLD,
	headPoint,
	makeView,
	replaceFrame,
	rgba,
	RIPPLE_SPAN_P,
	S,
	screenX,
	screenY,
	stageBox,
	WARM_GOLD_AT,
	WHITE,
	type Rgb
} from '../chaosPaint.ts';
import { clamp01, inversePiecewise, KNOTS_FLOW, lerp, piecewise, rampP } from '../chaosScene.ts';
import { beatAt } from '../chapters.ts';
import { drawWeatherLine, fullChart } from './weather.ts';

const BODY_VIEW = makeView(0, 90); // 위에서 내려다본 평면: 가로 x · 세로 y
const BODY_COUNT = 3;
const BODY_WARM = [0, 0.32, WARM_GOLD_AT]; // 질량 3 흰빛 · 4 옅은 금 · 5 금빛
const BODY_HEAD_CSS = [26, 32, 38];
const BODY_TAIL = 260; // 표본(모형 시간 2.6)
const GOLD_BODY = 2; // 질량 5 천체(금빛)
const AMBER: Rgb = [255, 170, 86]; // 5-3 등잔(따뜻한 예외)

type BodyFit = {
	width: number;
	height: number;
	scale: number;
	offsetU: number;
	offsetV: number;
	cx: number;
	cy: number;
};
let bodyFit: BodyFit | null = null;

/** 두 계산 전 구간이 그림 상자에 들어가는 하나의 배율 · 가운데(캔버스 크기가 바뀌면 다시 잰다) */
function bodyFrame(): void {
	if (bodyFit === null || bodyFit.width !== S.width || bodyFit.height !== S.height) {
		const bodies = S.world.bodies();
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (const track of [...bodies.tracks, ...bodies.nudged]) {
			for (let sample = 0; sample < bodies.samples; sample++) {
				const x = track[sample * 3];
				const y = track[sample * 3 + 1];
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
		const box = stageBox();
		bodyFit = {
			width: S.width,
			height: S.height,
			scale: Math.min((box.width * 0.9) / (maxX - minX), (box.height * 0.9) / (maxY - minY)),
			offsetU: (minX + maxX) / 2,
			offsetV: (minY + maxY) / 2,
			cx: box.cx,
			cy: box.cy
		};
	}
	replaceFrame({ view: BODY_VIEW, ...bodyFit });
}

type BodyLook = { trace: number; tail: number; headAlpha: number; warmShift: number };

function drawBodies(tracks: Float32Array[], sample: number, look: BodyLook): void {
	for (let body = 0; body < BODY_COUNT; body++) {
		addTrail(tracks[body], 0, sample, 6, (age) => {
			const fresh = Math.exp(-age / BODY_TAIL);
			return {
				alpha: look.trace + look.tail * fresh,
				warm: clamp01(BODY_WARM[body] + look.warmShift),
				width: 0.8 + 1.2 * fresh
			};
		});
	}
	flushTrails();
	for (let body = 0; body < BODY_COUNT; body++) {
		const [x, y] = headPoint(tracks[body], sample);
		drawSprite(body === GOLD_BODY ? 'gold' : 'white', x, y, BODY_HEAD_CSS[body], look.headAlpha);
	}
}

const STAR_SEED = 1888; // 임의 고정값
const STAR_COUNT = 130;
const STARS = (() => {
	const random = mulberry32(STAR_SEED);
	return Array.from({ length: STAR_COUNT }, () => ({
		x: random(),
		y: random(),
		size: 2 + random() * 4,
		level: 0.15 + random() * 0.5,
		phase: random() * Math.PI * 2
	}));
})();

function drawStarfield(alpha: number, seconds: number, alive: boolean): void {
	if (alpha <= 0) return;
	for (const star of STARS)
		drawSprite(
			'dust',
			star.x * S.width,
			star.y * S.height,
			star.size,
			alpha * star.level * (alive ? 0.75 + 0.25 * Math.sin(seconds * 0.9 + star.phase) : 0.85)
		);
}

export function paint51(p: number, seconds: number, alive: boolean): void {
	drawStarfield(rampP(p, beatAt('5-1', 0, 0.3), beatAt('5-1', 1, 0.3)), seconds, alive);
	bodyFrame();
	const bodies = S.world.bodies();
	for (let body = 0; body < BODY_COUNT; body++) {
		const on = rampP(p, beatAt('5-1', 1, 0.35 + body * 0.15), beatAt('5-1', 1, 0.5 + body * 0.15));
		const [x, y] = headPoint(bodies.tracks[body], 0);
		drawSprite(body === GOLD_BODY ? 'gold' : 'white', x, y, BODY_HEAD_CSS[body], on);
		drawSprite('flash', x, y, BODY_HEAD_CSS[body] * 2.2, 0.3 * on);
	}
	applyBloom(0.7);
}

export function paint52(p: number, seconds: number, alive: boolean): void {
	drawStarfield(1, seconds, alive);
	bodyFrame();
	drawBodies(S.world.bodies().tracks, piecewise(KNOTS_FLOW.body52, p) / BODY_SAMPLE_TIME, {
		trace: 0.05,
		tail: 0.75,
		headAlpha: 1,
		warmShift: 0
	});
	applyBloom(0.8);
}

const BODY_HOLE_SAMPLES = 120; // 구멍 반폭(표본)
const PEN_SAMPLES = 420; // 펜이 따라가는 길이(표본)
const TRACE_END_TIME = 30; // 5-2 끝 그림의 옅은 궤도 길이(모형 시간)

function drawLamp(alpha: number, seconds: number, alive: boolean): void {
	if (alpha <= 0) return;
	const context = S.context;
	const flicker = alive ? 0.94 + 0.06 * Math.sin(seconds * 5.3) * Math.sin(seconds * 2.1) : 1;
	const x = S.width / 2;
	const y = S.height * 0.06;
	const glow = context.createRadialGradient(x, y, 0, x, y, Math.max(S.width, S.height) * 0.62);
	glow.addColorStop(0, rgba(AMBER, 0.34 * alpha * flicker));
	glow.addColorStop(0.35, rgba(AMBER, 0.1 * alpha * flicker));
	glow.addColorStop(1, rgba(AMBER, 0));
	context.fillStyle = glow;
	context.fillRect(0, 0, S.width, S.height);
}

const PAPER_SEED = 1889; // 임의 고정값
const PAPER_COUNT = 22;
const PAPERS = (() => {
	const random = mulberry32(PAPER_SEED);
	return Array.from({ length: PAPER_COUNT }, (_, index) => ({
		x: 0.08 + random() * 0.84,
		y: 0.1 + random() * 0.8,
		angle: (random() - 0.5) * 2.4,
		stackAngle: (random() - 0.5) * 0.12,
		stack: index
	}));
})();
const PAPER_LINES = [-0.2, 0.05, 0.3];

/** 흩어진 종이 조각이 거꾸로 모여 한 더미로(gather 0 흩어짐 → 1 모임) */
function drawPapers(gather: number, alpha: number): void {
	if (alpha <= 0) return;
	const context = S.context;
	const stackX = S.width * 0.8;
	const stackY = S.height * 0.84;
	const w = css(16);
	const h = css(21);
	for (const paper of PAPERS) {
		context.save();
		context.translate(
			lerp(paper.x * S.width, stackX, gather),
			lerp(paper.y * S.height, stackY - paper.stack * css(1.2), gather)
		);
		context.rotate(lerp(paper.angle, paper.stackAngle, gather));
		context.fillStyle = rgba(WHITE, 0.05 * alpha);
		context.fillRect(-w / 2, -h / 2, w, h);
		context.strokeStyle = rgba(WHITE, 0.45 * alpha);
		context.lineWidth = css(1);
		context.strokeRect(-w / 2, -h / 2, w, h);
		context.strokeStyle = rgba(WHITE, 0.2 * alpha);
		context.beginPath();
		for (const line of PAPER_LINES) {
			context.moveTo(-w * 0.3, h * line);
			context.lineTo(w * 0.3, h * line);
		}
		context.stroke();
		context.restore();
	}
}

export function paint53(p: number, seconds: number, alive: boolean): void {
	const context = S.context;
	const bodies = S.world.bodies();
	const stop = bodies.stopSample;
	const lamp = rampP(p, beatAt('5-3', 2, 0.1), beatAt('5-3', 2, 0.8));
	drawLamp(lamp, seconds, alive);
	drawStarfield(1 - 0.6 * lamp, seconds, alive);
	bodyFrame();
	const traceEnd = TRACE_END_TIME / BODY_SAMPLE_TIME;
	const hole = rampP(p, beatAt('5-3', 4, 0), beatAt('5-3', 4, 0.6)) * BODY_HOLE_SAMPLES;
	// 옅은 궤도(5-2 끝 그림). 질량 5 궤도의 멈춘 자리 앞뒤는 구멍으로 비운다
	for (let body = 0; body < BODY_COUNT; body++) {
		addTrail(bodies.tracks[body], 0, traceEnd, 6, (_age, index) =>
			body === GOLD_BODY && Math.abs(index - stop) < hole
				? null
				: { alpha: body === GOLD_BODY ? 0.12 : 0.07, warm: BODY_WARM[body], width: 0.9 }
		);
	}
	flushTrails();
	// 펜: 질량 5 궤도를 따라가다 멈춘 자리에서 선다
	const penOn =
		rampP(p, beatAt('5-3', 3, 0), beatAt('5-3', 3, 0.15)) *
		(1 - 0.6 * rampP(p, beatAt('5-3', 5, 0), beatAt('5-3', 5, 0.5)));
	if (penOn > 0) {
		const pen = piecewise(
			[
				[beatAt('5-3', 3, 0), stop - PEN_SAMPLES],
				[beatAt('5-3', 3, 0.85), stop]
			],
			p
		);
		addTrail(bodies.tracks[GOLD_BODY], Math.max(0, pen - PEN_SAMPLES), pen, 3, (age) => ({
			alpha: 0.8 * penOn * (1 - age / PEN_SAMPLES),
			warm: WARM_GOLD_AT,
			width: 1.5
		}));
		flushTrails();
		const [x, y] = headPoint(bodies.tracks[GOLD_BODY], pen);
		drawSprite('gold', x, y, 34, penOn);
	}
	if (hole > 0) {
		const [x, y] = headPoint(bodies.tracks[GOLD_BODY], stop);
		context.strokeStyle = rgba(WHITE, (0.5 * hole) / BODY_HOLE_SAMPLES);
		context.lineWidth = css(1);
		context.beginPath();
		context.arc(x, y, css(14), 0, Math.PI * 2);
		context.stroke();
	}
	drawPapers(
		rampP(p, beatAt('5-3', 5, 0.15), beatAt('5-3', 5, 0.95)),
		rampP(p, beatAt('5-3', 5, 0), beatAt('5-3', 5, 0.15))
	);
	applyBloom(0.6);
}

export function paint54(p: number, seconds: number, alive: boolean): void {
	const bodies = S.world.bodies();
	const blur = rampP(p, beatAt('5-4', 4, 0), beatAt('5-4', 4, 0.8));
	const chartOn = rampP(p, beatAt('5-4', 4, 0.4), beatAt('5-4', 5, 0.4));
	const leftover = 1 - rampP(p, 0, beatAt('5-4', 0, 0.6)); // 5-3 끝의 등잔 · 종이 더미가 사라진다
	drawLamp(leftover, seconds, alive);
	drawPapers(1, leftover);
	drawStarfield(0.6 * (1 - blur), seconds, alive);
	bodyFrame();
	const sample = piecewise(KNOTS_FLOW.body54, p) / BODY_SAMPLE_TIME;
	const runs = rampP(p, beatAt('5-4', 1, 0), beatAt('5-4', 1, 0.1)) * (1 - blur);
	if (runs > 0) {
		// 원래 계산(금빛 쪽) · 1e-6 바꾼 계산(흰빛)
		drawBodies(bodies.tracks, sample, {
			trace: 0,
			tail: 0.7 * runs,
			headAlpha: runs,
			warmShift: 0.25
		});
		drawBodies(bodies.nudged, sample, {
			trace: 0,
			tail: 0.55 * runs,
			headAlpha: 0.8 * runs,
			warmShift: -1
		});
	}
	if (chartOn > 0) {
		// 2장의 두 갈래 선이 겹쳐 나타난다
		const chart = fullChart();
		drawWeatherLine(chart, 'base', 0, WEATHER_DAYS, GOLD, 0.8 * chartOn, false);
		drawWeatherLine(chart, 'copy', 0, WEATHER_DAYS, WHITE, 0.9 * chartOn, false);
	}
	applyBloom(0.8);
	// 갈라짐 파문: 가장 먼저 벌어진 천체의 두 계산 가운데
	bodyFrame();
	const split = bodies.split;
	const a = bodies.tracks[split.body];
	const b = bodies.nudged[split.body];
	const middleX = (a[split.sample * 3] + b[split.sample * 3]) / 2;
	const middleY = (a[split.sample * 3 + 1] + b[split.sample * 3 + 1]) / 2;
	drawRippleAt(
		screenX(middleX, middleY),
		screenY(middleX, middleY, BODY_Z),
		(p - inversePiecewise(KNOTS_FLOW.body54, split.time)) / RIPPLE_SPAN_P,
		runs
	);
}
