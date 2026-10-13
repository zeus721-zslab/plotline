// 2장 「아무도 보지 않던 한 시간」(시제품 :1542-1807): 온도계(2-1) · 출력지와 날씨 선(2-2 · 2-3) · 진공관 불빛과 다시 계산한 날씨(2-4) ·
// 두 날씨가 갈라짐(2-5) · 두 출력지 비교(2-6). 출력지 숫자는 계산값(x ÷ 눈금)이다.
import { mulberry32, WEATHER_DAYS, WEATHER_DAYS_BEFORE, weatherX } from '../chaosCompute.ts';
import {
	applyBloom,
	css,
	drawLabel,
	drawSprite,
	FONT_MONO,
	GOLD,
	isWide,
	mix,
	rgba,
	roundedRectPath,
	S,
	stageBox,
	strokePoints,
	WHITE,
	type Rgb
} from '../chaosPaint.ts';
import { KNOTS_FLOW, lerp, piecewise, rampP, smoothstep } from '../chaosScene.ts';
import { beatAt } from '../chapters.ts';
import {
	chartX,
	chartY,
	drawDayAxis,
	drawWeatherLine,
	fullChart,
	weatherAreas,
	weatherRippleAt,
	type Chart,
	type WeatherSeries
} from './weather.ts';

const PAPER_INK: Rgb = [236, 230, 218];

// ───────── 2-1 온도계 ─────────
const TEMPERATURE_DAYS = 28;
const TEMPERATURE_SEED = 1917; // 임의 고정값
const TEMPERATURE_MAX = 30;
const TEMPERATURE = (() => {
	const random = mulberry32(TEMPERATURE_SEED);
	let value = 15;
	return Array.from({ length: TEMPERATURE_DAYS }, () => {
		value += (random() - 0.5) * 8 + (15 - value) * 0.2;
		return Math.min(TEMPERATURE_MAX - 2, Math.max(2, value));
	});
})();

export function paint21(p: number): void {
	const context = S.context;
	const box = stageBox();
	const appear = rampP(p, 0, beatAt('2-1', 0, 0.35));
	const stemX = box.left + box.width * 0.1;
	const top = box.top + box.height * 0.06;
	const bottom = box.bottom - box.height * 0.16;
	const toY = (temperature: number): number => lerp(bottom, top, temperature / TEMPERATURE_MAX);
	context.strokeStyle = rgba(WHITE, 0.32 * appear);
	context.lineWidth = css(1);
	context.beginPath();
	context.moveTo(stemX, bottom + css(8));
	context.lineTo(stemX, top);
	for (let temperature = 0; temperature <= TEMPERATURE_MAX; temperature += 2) {
		context.moveTo(stemX, toY(temperature));
		context.lineTo(stemX + css(temperature % 10 === 0 ? 10 : 5), toY(temperature));
	}
	context.stroke();
	for (let temperature = 0; temperature <= TEMPERATURE_MAX; temperature += 10)
		drawLabel(`${temperature}°`, stemX - css(8), toY(temperature), 10, WHITE, 0.5 * appear, {
			align: 'right'
		});
	const bulbY = bottom + css(17);
	context.beginPath();
	context.arc(stemX, bulbY, css(8), 0, Math.PI * 2);
	context.stroke();
	const shown = piecewise(
		[
			[beatAt('2-1', 0, 0.35), 0],
			[beatAt('2-1', 2, 0.85), TEMPERATURE_DAYS]
		],
		p
	);
	const count = Math.min(TEMPERATURE_DAYS, Math.floor(shown));
	const chartLeft = box.left + box.width * 0.26;
	const dayX = (day: number): number => lerp(chartLeft, box.right, day / (TEMPERATURE_DAYS - 1));
	const points: number[] = [];
	for (let day = 0; day < count; day++) points.push(dayX(day), toY(TEMPERATURE[day]));
	strokePoints(points, WHITE, 0.4 * appear, 0.9);
	for (let day = 0; day < count; day++) {
		const fresh = day === count - 1 ? 1 : 0;
		drawSprite(
			'gold',
			dayX(day),
			toY(TEMPERATURE[day]),
			14 + 14 * fresh,
			(0.55 + 0.4 * fresh) * appear
		);
	}
	if (count > 0) {
		// 수은 기둥: 마지막으로 찍은 날의 기온까지
		strokePoints([stemX, bulbY, stemX, toY(TEMPERATURE[count - 1])], GOLD, 0.8 * appear, 2.2);
		drawSprite('gold', stemX, bulbY, 30, 0.75 * appear);
	}
	applyBloom(0.6);
}

// ───────── 2장 출력지 ─────────
const PRINT_FIRST_DAY = -WEATHER_DAYS_BEFORE;
const PRINT_ROWS = WEATHER_DAYS_BEFORE + WEATHER_DAYS + 1; // −40일 ~ 60일 한 줄씩
const RESTART_ROW = WEATHER_DAYS_BEFORE; // 다시 출발한 줄(0일)
const PRINT_DECIMALS = 3; // 출력지는 소수점 아래 세 자리까지만 찍었다(원고 3-1)
const ROW_NUMBER_DIGITS = 3;

function printValue(series: WeatherSeries, day: number): string {
	const weather = S.world.weather;
	const value = weatherX(weather, series, day) / weather.printScale;
	return `${value < 0 ? '-' : ' '}${Math.abs(value).toFixed(PRINT_DECIMALS)}`;
}

type PrintLayout = {
	left: number;
	right: number;
	fontSize: number;
	rowHeight: number;
	top: number;
	bottom: number;
	rows: number;
};

function printLayout(): PrintLayout {
	const area = weatherAreas().table;
	const wide = isWide();
	const fontSize = css(wide ? 14 : 11);
	const rowHeight = fontSize * 1.65;
	const panelWidth = Math.min(area.right - area.left, css(wide ? 260 : 340));
	const left = area.left + (area.right - area.left - panelWidth) / 2;
	const top = area.top + css(4);
	const bottom = area.bottom - css(4);
	return {
		left,
		right: left + panelWidth,
		fontSize,
		rowHeight,
		top,
		bottom,
		rows: Math.floor((bottom - top) / rowHeight)
	};
}

function splitChart(dayStart: number): Chart {
	const area = weatherAreas().line;
	return {
		dayStart,
		dayEnd: WEATHER_DAYS,
		left: area.left,
		right: area.right,
		top: area.top,
		bottom: area.bottom
	};
}

/** 출력지: firstRow(맨 위 줄, 소수 가능)부터 보이고, printed(찍힌 줄 수, 소수면 마지막 줄이 찍히는 중)까지 글자가 있다 */
function drawPrintout(
	layout: PrintLayout,
	firstRow: number,
	printed: number,
	alpha: number,
	highlightRow: number,
	highlightAlpha: number
): void {
	if (alpha <= 0) return;
	const context = S.context;
	const { left, right, rowHeight, top, bottom } = layout;
	context.strokeStyle = rgba(WHITE, 0.1 * alpha);
	context.lineWidth = css(1);
	context.strokeRect(left, top - css(6), right - left, bottom - top + css(12));
	// 양쪽 구멍 줄(종이와 함께 올라간다)
	const holeSpacing = rowHeight * 2;
	const holeOffset = (((-firstRow * rowHeight) % holeSpacing) + holeSpacing) % holeSpacing;
	context.fillStyle = rgba(WHITE, 0.12 * alpha);
	context.beginPath();
	for (let y = top + holeOffset; y < bottom; y += holeSpacing) {
		for (const x of [left + css(7), right - css(7)]) {
			context.moveTo(x + css(2), y);
			context.arc(x, y, css(2), 0, Math.PI * 2);
		}
	}
	context.fill();
	if (highlightAlpha > 0) {
		const y = top + (highlightRow - firstRow) * rowHeight;
		if (y > top - rowHeight && y < bottom) {
			context.fillStyle = rgba(GOLD, 0.14 * highlightAlpha * alpha);
			context.fillRect(left + css(14), y, right - left - css(28), rowHeight);
		}
	}
	context.font = `${Math.round(layout.fontSize)}px ${FONT_MONO}`;
	context.textBaseline = 'middle';
	const lastRow = Math.min(PRINT_ROWS - 1, Math.ceil(printed) - 1);
	for (let row = Math.max(0, Math.floor(firstRow)); row <= lastRow; row++) {
		const y = top + (row - firstRow + 0.5) * rowHeight;
		if (y < top || y > bottom) continue;
		const edge = Math.min(1, (y - top) / rowHeight, (bottom - y) / rowHeight); // 위아래 끝에서 옅게
		const rowAlpha = alpha * edge * Math.min(1, printed - row);
		const marked = highlightAlpha > 0 && row === Math.round(highlightRow);
		context.textAlign = 'left';
		context.fillStyle = rgba(WHITE, 0.3 * rowAlpha);
		context.fillText(String(row + 1).padStart(ROW_NUMBER_DIGITS, '0'), left + css(16), y);
		context.textAlign = 'right';
		context.fillStyle = rgba(
			marked ? WHITE : PAPER_INK,
			(marked ? lerp(0.72, 1, highlightAlpha) : 0.72) * rowAlpha
		);
		context.fillText(printValue('base', row + PRINT_FIRST_DAY), right - css(16), y);
	}
}

function drawRestartRing(
	chart: Chart,
	alpha: number,
	layout: PrintLayout | null,
	firstRow: number
): void {
	if (alpha <= 0) return;
	const context = S.context;
	const x = chartX(chart, 0);
	const y = chartY(chart, weatherX(S.world.weather, 'base', 0));
	context.strokeStyle = rgba(mix(GOLD, WHITE, 0.5), 0.85 * alpha);
	context.lineWidth = css(1.4);
	context.beginPath();
	context.arc(x, y, css(10), 0, Math.PI * 2);
	context.stroke();
	if (layout === null) return;
	// 강조한 출력지 줄 → 고리 사이 점선
	const rowY = layout.top + (RESTART_ROW - firstRow + 0.5) * layout.rowHeight;
	context.setLineDash([css(2), css(4)]);
	context.strokeStyle = rgba(GOLD, 0.35 * alpha);
	context.lineWidth = css(1);
	context.beginPath();
	context.moveTo(layout.right + css(4), rowY);
	context.lineTo(x - css(12), y);
	context.stroke();
	context.setLineDash([]);
}

// 2-4 진공관 불빛 점
const TUBE_SEED = 30; // 임의 고정값
const TUBE_ROWS = 6;
const TUBE_COLUMNS = 9;
const TUBES = (() => {
	const random = mulberry32(TUBE_SEED);
	const list: { x: number; y: number; rate: number; phase: number; size: number }[] = [];
	for (let row = 0; row < TUBE_ROWS; row++) {
		for (let column = 0; column < TUBE_COLUMNS; column++) {
			list.push({
				x: (column + 0.5 + (random() - 0.5) * 0.5) / TUBE_COLUMNS,
				y: 0.08 + ((row + 0.5 + (random() - 0.5) * 0.4) / TUBE_ROWS) * 0.84,
				rate: 0.6 + random() * 2.2,
				phase: random() * Math.PI * 2,
				size: 8 + random() * 8
			});
		}
	}
	return list;
})();

function drawTubes(alpha: number, seconds: number, alive: boolean): void {
	if (alpha <= 0) return;
	for (const tube of TUBES) {
		const flicker = alive
			? 0.5 +
				0.5 *
					Math.sin(seconds * tube.rate + tube.phase) *
					Math.sin(seconds * tube.rate * 0.37 + tube.phase * 2)
			: 0.5;
		drawSprite(
			'gold',
			tube.x * S.width,
			tube.y * S.height,
			tube.size,
			alpha * (0.14 + 0.3 * flicker)
		);
	}
}

export function paint22(p: number): void {
	const layout = printLayout();
	const printed = piecewise(KNOTS_FLOW.print22, p);
	drawPrintout(layout, Math.max(0, printed - layout.rows), printed, 1, -1, 0);
	if (printed > 1)
		drawWeatherLine(
			splitChart(PRINT_FIRST_DAY),
			'base',
			PRINT_FIRST_DAY,
			PRINT_FIRST_DAY + printed - 1,
			GOLD,
			0.9,
			printed < PRINT_ROWS
		);
	applyBloom(0.6);
}

export function paint23(p: number): void {
	const layout = printLayout();
	const back = rampP(p, beatAt('2-3', 3, 0), beatAt('2-3', 3, 0.5));
	const firstRow = lerp(PRINT_ROWS - layout.rows, RESTART_ROW - layout.rows / 2 + 0.5, back);
	drawPrintout(
		layout,
		firstRow,
		PRINT_ROWS,
		1,
		RESTART_ROW,
		rampP(p, beatAt('2-3', 3, 0.3), beatAt('2-3', 3, 0.6))
	);
	const chart = splitChart(PRINT_FIRST_DAY);
	drawWeatherLine(chart, 'base', PRINT_FIRST_DAY, WEATHER_DAYS, GOLD, 0.9, false);
	drawRestartRing(chart, rampP(p, beatAt('2-3', 3, 0.5), beatAt('2-3', 3, 0.85)), layout, firstRow);
	const whiteDay = piecewise(
		[
			[beatAt('2-3', 4, 0.1), 0],
			[beatAt('2-3', 5, 0.9), 3]
		],
		p
	);
	if (whiteDay > 0) drawWeatherLine(chart, 'copy', 0, whiteDay, WHITE, 0.95, true);
	applyBloom(0.7);
}

export function paint24(p: number, seconds: number, alive: boolean): void {
	const context = S.context;
	const layout = printLayout();
	const dim = rampP(p, beatAt('2-4', 0, 0.1), beatAt('2-4', 2, 0.6));
	const pan = rampP(p, beatAt('2-4', 1, 0), beatAt('2-4', 2, 0.9));
	drawPrintout(
		layout,
		RESTART_ROW - layout.rows / 2 + 0.5,
		PRINT_ROWS,
		1 - dim,
		RESTART_ROW,
		1 - dim
	);
	// 표 영역과 겹치지 않는 선 자리에 고정(날짜 범위만 pan 에 따라 −40일→0일로 좁아진다)
	const chart = splitChart(lerp(PRINT_FIRST_DAY, 0, pan));
	drawTubes(0.9 * rampP(p, beatAt('2-4', 2, 0.3), beatAt('2-4', 3, 0.6)), seconds, alive);
	context.save();
	context.beginPath();
	context.rect(chart.left - css(10), 0, chart.right - chart.left + css(20), S.height);
	context.clip();
	drawWeatherLine(chart, 'base', PRINT_FIRST_DAY, WEATHER_DAYS, GOLD, lerp(0.9, 0.42, dim), false);
	drawRestartRing(chart, 1 - dim, null, 0);
	drawWeatherLine(chart, 'copy', 0, piecewise(KNOTS_FLOW.white24, p), WHITE, 0.95, true);
	context.restore();
	drawDayAxis(chart, pan);
	applyBloom(0.8);
}

export function paint25(p: number, seconds: number, alive: boolean): void {
	const chart = fullChart();
	const whiteDay = piecewise(KNOTS_FLOW.white25, p);
	const lift = rampP(p, 0, beatAt('2-5', 0, 0.6));
	drawTubes(0.9 * (1 - lift), seconds, alive);
	drawWeatherLine(chart, 'base', 0, WEATHER_DAYS, GOLD, lerp(0.42, 0.85, lift), false);
	drawWeatherLine(chart, 'copy', 0, whiteDay, WHITE, 0.95, whiteDay < WEATHER_DAYS);
	drawDayAxis(chart, 1);
	applyBloom(0.8);
	weatherRippleAt(chart, p, KNOTS_FLOW.white25);
}

// 2-6 두 출력지를 나란히: 빛이 한 줄씩 거슬러 올라가 0일 줄(찍힌 값)에 머문다
function drawComparePrintout(
	alpha: number,
	highlight: number,
	rest: number,
	seconds: number,
	alive: boolean
): void {
	if (alpha <= 0) return;
	const context = S.context;
	const box = stageBox();
	const wide = isWide();
	const fontSize = css(wide ? 15 : 12);
	const rowHeight = fontSize * 1.7;
	const panelWidth = Math.min(box.width, css(wide ? 430 : 340)); // 표가 그림의 중심 — 2-6은 표가 주인공
	const left = S.width / 2 - panelWidth / 2;
	const top = box.top + rowHeight * 1.4;
	const bottom = box.bottom;
	const rows = Math.floor((bottom - top) / rowHeight);
	const firstRow = Math.max(0, Math.min(WEATHER_DAYS + 1 - rows, highlight - rows * 0.55));
	const columns = {
		day: left + panelWidth * 0.06,
		old: left + panelWidth * 0.6,
		fresh: left + panelWidth * 0.94
	};
	drawLabel('처음 계산', columns.old, box.top + rowHeight * 0.5, 11, GOLD, 0.85 * alpha, {
		align: 'right'
	});
	drawLabel('다시 계산', columns.fresh, box.top + rowHeight * 0.5, 11, WHITE, 0.85 * alpha, {
		align: 'right'
	});
	context.fillStyle = rgba(GOLD, 0.16 * alpha);
	context.fillRect(left, top + (highlight - firstRow) * rowHeight, panelWidth, rowHeight);
	context.font = `${Math.round(fontSize)}px ${FONT_MONO}`;
	context.textBaseline = 'middle';
	for (
		let row = Math.floor(firstRow);
		row <= Math.min(WEATHER_DAYS, Math.ceil(firstRow + rows));
		row++
	) {
		const y = top + (row - firstRow + 0.5) * rowHeight;
		if (y < top || y > bottom) continue;
		const edge = Math.min(1, (y - top) / rowHeight, (bottom - y) / rowHeight);
		const near = 1 - smoothstep(0, 1.5, Math.abs(row - highlight));
		const rowAlpha = alpha * edge * (0.45 + 0.55 * near);
		context.textAlign = 'left';
		context.fillStyle = rgba(WHITE, 0.35 * rowAlpha);
		context.fillText(String(row), columns.day, y);
		context.textAlign = 'right';
		context.fillStyle = rgba(GOLD, 0.95 * rowAlpha);
		context.fillText(printValue('base', row), columns.old, y);
		context.fillStyle = rgba(WHITE, 0.95 * rowAlpha);
		context.fillText(printValue('copy', row), columns.fresh, y);
	}
	if (rest > 0) {
		// 머무는 곳: 0일 줄 '다시 계산'의 찍힌 값
		const y = top + (0 - firstRow + 0.5) * rowHeight;
		const valueWidth = fontSize * 3.9;
		roundedRectPath(
			columns.fresh - valueWidth,
			y - rowHeight * 0.48,
			valueWidth + css(6),
			rowHeight * 0.96,
			css(4)
		);
		context.strokeStyle = rgba(GOLD, 0.8 * rest * alpha);
		context.lineWidth = css(1.2);
		context.stroke();
		drawSprite(
			'gold',
			columns.fresh - valueWidth / 2,
			y,
			70,
			0.3 * rest * alpha * (alive ? 0.85 + 0.15 * Math.sin(seconds * 2) : 1)
		);
	}
}

// 표가 주인공 — 선은 p 0~0.4 동안 꺼져 0 이 되고, 그 뒤는 표만 남는다(되감으면 다시 켜진다)
const LINE_OFF_26 = 0.4;

export function paint26(p: number, seconds: number, alive: boolean): void {
	const chart = fullChart();
	const show = rampP(p, beatAt('2-6', 0, 0.05), beatAt('2-6', 0, 0.6));
	const lineFade = 1 - rampP(p, 0, LINE_OFF_26);
	drawWeatherLine(chart, 'base', 0, WEATHER_DAYS, GOLD, 0.85 * lineFade, false);
	drawWeatherLine(chart, 'copy', 0, WEATHER_DAYS, WHITE, 0.95 * lineFade, false);
	const highlight = piecewise(
		[
			[beatAt('2-6', 4, 0.05), WEATHER_DAYS],
			[beatAt('2-6', 4, 0.95), 0]
		],
		p
	);
	drawComparePrintout(
		show,
		highlight,
		rampP(p, beatAt('2-6', 5, 0.05), beatAt('2-6', 5, 0.5)),
		seconds,
		alive
	);
	applyBloom(0.6);
}
