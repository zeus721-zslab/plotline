// 3장 「0.506」(시제품 :1809-2165): 큰 숫자에서 떨어진 세 자리의 잔광(3-1) · 1미터 막대 둘(3-2) · 두 언덕 하늘(3-3) ·
// 칸마다 두 배(3-4) · 같은 출발 셋과 다른 출발 하나(3-5). 그리는 숫자(0.506127 · 0.506 · 0.25 mm)는 데이터에서 읽는다.
import { WEATHER_DAYS } from '../chaosCompute.ts';
import {
	applyBloom,
	css,
	drawLabel,
	drawSprite,
	FONT_MONO,
	GOLD,
	rgba,
	S,
	stageBox,
	strokePoints,
	WHITE,
	type Rgb
} from '../chaosPaint.ts';
import {
	bigNumberState,
	KNOTS_FLOW,
	lerp,
	piecewise,
	rampP,
	smoothstep,
	valleyState33
} from '../chaosScene.ts';
import { beatAt } from '../chapters.ts';
import { drawValley, rainOf, valleyRects } from './valley.ts';
import { drawDayAxis, drawWeatherLine, fullChart, weatherRippleAt } from './weather.ts';

// ───────── 3-1 큰 숫자(DOM) · 떨어진 자리의 잔광(캔버스) ─────────
export function paint31(p: number): void {
	const point = S.bigNumberPoint();
	if (point === null) return;
	const context = S.context;
	const state = bigNumberState(p);
	const { centerY, digitX, fallPx } = point;
	const gradient = context.createRadialGradient(
		S.width / 2,
		centerY,
		0,
		S.width / 2,
		centerY,
		Math.min(S.width, S.height) * 0.5
	);
	gradient.addColorStop(0, rgba(GOLD, 0.12 * state.appear));
	gradient.addColorStop(1, rgba(GOLD, 0));
	context.fillStyle = gradient;
	context.fillRect(0, 0, S.width, S.height);
	state.drops.forEach((t, k) => {
		if (t <= 0 || k >= digitX.length) return;
		drawSprite(
			'dust',
			digitX[k],
			centerY + t * t * fallPx,
			30,
			0.7 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * state.appear
		);
		drawSprite('dust', digitX[k], centerY + fallPx, 12, 0.22 * t * state.appear);
	});
	applyBloom(0.5);
}

// ───────── 3-2 1미터 막대 둘 ─────────
const BAR_MM = 1000;
const LEAD_MM = 0.5;

function drawBar(x0: number, x1: number, y: number, h: number, color: Rgb, alpha: number): void {
	if (alpha <= 0) return;
	const context = S.context;
	const left = Math.max(x0, -css(20));
	const right = Math.min(x1, S.width + css(20));
	if (right <= left) return;
	context.fillStyle = rgba(color, 0.12 * alpha);
	context.fillRect(left, y, right - left, h);
	context.strokeStyle = rgba(color, 0.75 * alpha);
	context.lineWidth = css(1.2);
	context.strokeRect(left, y, right - left, h);
}

/** 막대 위 눈금: 화면에서 8px 이상 벌어지는 10의 거듭제곱 간격(확대할수록 고와진다) */
function drawRuler(
	toX: (mm: number) => number,
	viewLeft: number,
	viewWidth: number,
	pixelsWidth: number,
	barY: number,
	alpha: number
): void {
	if (alpha <= 0) return;
	const context = S.context;
	const pixelsPerMm = pixelsWidth / viewWidth;
	let spacing = 0.01;
	while (spacing * pixelsPerMm < css(8)) spacing *= 10;
	const first = Math.max(0, Math.ceil(viewLeft / spacing));
	const last = Math.min(Math.round(BAR_MM / spacing), Math.floor((viewLeft + viewWidth) / spacing));
	context.strokeStyle = rgba(GOLD, 0.4 * alpha);
	context.lineWidth = css(1);
	context.beginPath();
	for (let k = first; k <= last; k++) {
		const x = toX(k * spacing);
		context.moveTo(x, barY);
		context.lineTo(x, barY - css(k % 10 === 0 ? 7 : 3.5));
	}
	context.stroke();
}

export function paint32(p: number): void {
	// 짧아진 길이(mm)는 데이터(원래 값 ÷ 차이)에서 읽는다. 대조가 어긋나면 막대 장면을 그리지 않는다
	const shortMm = S.figures.barShortMm;
	if (shortMm === null) return;
	const context = S.context;
	const box = stageBox();
	const appear = rampP(p, 0, beatAt('3-2', 0, 0.4));
	const zoom = rampP(p, beatAt('3-2', 2, 0.05), beatAt('3-2', 2, 0.8));
	// 보이는 폭(mm)을 로그로 줄이며, 두 막대 끝 가운데가 화면 오른쪽 끝(전체) → 가운데 조금 왼쪽(확대)으로 온다
	const startWidth = BAR_MM * 1.06;
	const viewWidth = Math.exp(lerp(Math.log(startWidth), Math.log(2.4), zoom));
	const focus = BAR_MM - shortMm / 2;
	const viewLeft = focus - lerp((focus + BAR_MM * 0.03) / startWidth, 0.42, zoom) * viewWidth;
	const toX = (mm: number): number => box.left + ((mm - viewLeft) / viewWidth) * box.width;
	const barHeight = css(12);
	const gap = css(28);
	const firstY = box.cy - gap / 2 - barHeight;
	const secondY = box.cy + gap / 2;
	drawBar(toX(0), toX(BAR_MM), firstY, barHeight, GOLD, appear);
	drawBar(toX(0), toX(BAR_MM - shortMm), secondY, barHeight, WHITE, appear);
	drawRuler(toX, viewLeft, viewWidth, box.width, firstY, appear);
	drawLabel(
		'1 m',
		(Math.max(toX(0), 0) + Math.min(toX(BAR_MM), S.width)) / 2,
		firstY - css(22),
		12,
		WHITE,
		0.75 * appear * (1 - smoothstep(0, 0.25, zoom))
	);
	const detail = smoothstep(0.65, 0.95, zoom);
	if (detail > 0) {
		const x0 = toX(BAR_MM - shortMm);
		const x1 = toX(BAR_MM);
		const y = secondY + barHeight + css(16);
		context.strokeStyle = rgba(WHITE, 0.6 * detail);
		context.lineWidth = css(1);
		context.beginPath();
		context.moveTo(x0, y - css(5));
		context.lineTo(x0, y + css(5));
		context.moveTo(x1, y - css(5));
		context.lineTo(x1, y + css(5));
		context.moveTo(x0, y);
		context.lineTo(x1, y);
		context.stroke();
		context.setLineDash([css(2), css(3)]);
		context.strokeStyle = rgba(GOLD, 0.45 * detail);
		context.beginPath();
		context.moveTo(x1, firstY + barHeight);
		context.lineTo(x1, y - css(5));
		context.stroke();
		context.setLineDash([]);
		drawLabel(`${shortMm} mm`, (x0 + x1) / 2, y + css(17), 12, WHITE, 0.85 * detail);
	}
	const lead = rampP(p, beatAt('3-2', 2, 0.72), beatAt('3-2', 2, 0.95));
	if (lead > 0) {
		const cx = toX(BAR_MM + LEAD_MM * 1.1);
		const cy = box.cy;
		const radius = (LEAD_MM / 2 / viewWidth) * box.width;
		const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
		gradient.addColorStop(0, rgba(GOLD, 0.2 * lead));
		gradient.addColorStop(1, rgba(GOLD, 0.05 * lead));
		context.fillStyle = gradient;
		context.beginPath();
		context.arc(cx, cy, radius, 0, Math.PI * 2);
		context.fill();
		context.strokeStyle = rgba(GOLD, 0.8 * lead);
		context.lineWidth = css(1.2);
		context.stroke();
		drawLabel(`${LEAD_MM} mm 샤프심`, cx, cy + radius + css(18), 12, GOLD, 0.9 * lead);
	}
	applyBloom(0.5);
}

// ───────── 3-3 두 언덕(위 0.506127 의 세계 · 아래 0.506 의 세계) ─────────
export function paint33(p: number, seconds: number, alive: boolean): void {
	const state = valleyState33(p, S.world.sky);
	const [upper, lower] = valleyRects();
	// 동작 줄이기(정지 그림, REDUCED_P 고정)는 끝 페이드아웃 구간 안이어도 그림이 보여야 한다
	const alpha = rampP(p, 0, beatAt('3-3', 0, 0.4)) * (alive ? state.fade : 1);
	const village = rampP(p, beatAt('3-3', 3, 0.1), beatAt('3-3', 3, 0.7));
	const labels = rampP(p, beatAt('3-3', 4, 0.05), beatAt('3-3', 4, 0.5));
	const { fullValueText, printedValueText } = S.figures;
	drawValley(
		upper,
		{
			clear: state.top,
			rain: rainOf(state.top),
			dusk: 0,
			night: state.night,
			village,
			label: fullValueText === null ? null : { text: fullValueText, alpha: labels },
			alpha
		},
		seconds,
		alive,
		p
	);
	drawValley(
		lower,
		{
			clear: state.bottom,
			rain: rainOf(state.bottom),
			dusk: 0,
			night: state.night,
			village,
			label: printedValueText === null ? null : { text: printedValueText, alpha: labels },
			alpha
		},
		seconds,
		alive,
		p
	);
	applyBloom(0.25);
}

// ───────── 3-4 칸마다 두 배 ─────────
// 본문 "두 배를 열두 번 하면 4096배": 출발 칸(1) + 두 배 된 칸 12개(2 … 4096)
const DOUBLINGS = 12;
export function paint34(p: number): void {
	const context = S.context;
	const box = stageBox();
	const rowHeight = box.height / (DOUBLINGS + 1);
	const labelX = box.left + box.width * 0.17;
	const areaLeft = box.left + box.width * 0.22;
	const areaCenter = (areaLeft + box.right) / 2;
	const maxWidth = (box.right - areaLeft) * 0.94;
	const firstOn = beatAt('3-4', 1, 0.2);
	const from = beatAt('3-4', 3, 0.2);
	const to = beatAt('3-4', 4, 0.85);
	for (let cell = 0; cell <= DOUBLINGS; cell++) {
		const on = cell === 0 ? firstOn : lerp(from, to, (cell - 1) / (DOUBLINGS - 1));
		const grow = smoothstep(on, on + 0.03, p);
		if (grow <= 0) continue;
		const y = box.top + (cell + 0.5) * rowHeight;
		context.strokeStyle = rgba(WHITE, 0.1 * grow);
		context.lineWidth = css(1);
		context.strokeRect(areaLeft, y - rowHeight * 0.36, box.right - areaLeft, rowHeight * 0.72);
		drawLabel(String(2 ** cell), labelX, y, 11, WHITE, 0.75 * grow, {
			align: 'right',
			font: FONT_MONO
		});
		// 빛 틈 너비 = 최대 × 2^(칸−12). 새로 켜지는 칸은 앞 칸 너비에서 두 배로 벌어진다
		const slit = maxWidth * Math.pow(2, cell - DOUBLINGS) * lerp(0.5, 1, grow);
		strokePoints(
			[areaCenter - slit / 2, y, areaCenter + slit / 2, y],
			cell === DOUBLINGS ? GOLD : WHITE,
			0.9 * grow,
			1.6
		);
		drawSprite('white', areaCenter, y, 10 + Math.min(16, (slit / S.dpr) * 0.1), 0.55 * grow);
	}
	applyBloom(0.6);
}

// ───────── 3-5 같은 출발 셋 · 다른 출발 하나 ─────────
const SAME_START_RUNS = 3;
export function paint35(p: number): void {
	const chart = fullChart();
	drawDayAxis(chart, rampP(p, 0, beatAt('3-5', 1, 0.5)));
	for (let run = 0; run < SAME_START_RUNS; run++) {
		const day = piecewise(
			[
				[beatAt('3-5', 2, run * 0.3), 0],
				[beatAt('3-5', 2, run * 0.3 + 0.28), WEATHER_DAYS]
			],
			p
		);
		if (day > 0) drawWeatherLine(chart, 'base', 0, day, GOLD, 0.42, day < WEATHER_DAYS);
	}
	const lone = piecewise(KNOTS_FLOW.lone35, p);
	if (lone > 0) drawWeatherLine(chart, 'copy', 0, lone, WHITE, 0.95, lone < WEATHER_DAYS);
	applyBloom(0.8);
	weatherRippleAt(chart, p, KNOTS_FLOW.lone35);
}
