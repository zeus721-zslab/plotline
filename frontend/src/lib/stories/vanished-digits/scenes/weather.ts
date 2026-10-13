// 두 날씨 그래프(2장 · 3장 · 5-4 공용, 시제품 :1171-1233): 날 축 · 날씨 선 · 갈라진 자리 파문.
import { WEATHER_DAYS, WEATHER_STEPS_PER_DAY, weatherX } from '../chaosCompute.ts';
import {
	AXIS,
	css,
	drawLabel,
	drawRippleAt,
	drawSprite,
	GOLD,
	isWide,
	rgba,
	RIPPLE_SPAN_P,
	S,
	stageBox,
	strokePoints,
	type Rgb
} from '../chaosPaint.ts';
import { inversePiecewise, type Knots } from '../chaosScene.ts';

export type WeatherSeries = 'base' | 'copy';
export type Chart = {
	dayStart: number;
	dayEnd: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
};
type Area = { left: number; right: number; top: number; bottom: number };

// 세로 = x(−21 ~ 21)
const WEATHER_X_RANGE = 21;
// 날 축 눈금 간격(일)
const DAY_TICK = 20;

export function chartX(chart: Chart, day: number): number {
	return (
		chart.left +
		((day - chart.dayStart) / (chart.dayEnd - chart.dayStart)) * (chart.right - chart.left)
	);
}

export function chartY(chart: Chart, value: number): number {
	return (
		(chart.top + chart.bottom) / 2 - ((value / WEATHER_X_RANGE) * (chart.bottom - chart.top)) / 2
	);
}

export function fullChart(): Chart {
	const box = stageBox();
	return {
		dayStart: 0,
		dayEnd: WEATHER_DAYS,
		left: box.left,
		right: box.right,
		top: box.top + box.height * 0.1,
		bottom: box.bottom - box.height * 0.12
	};
}

/** 2-2~2-4: 출력지(표)와 날씨 선(그래프) 자리를 나눠 겹치지 않게(휴대폰 위아래 · PC 좌우, 간격 16px 이상) */
export function weatherAreas(): { table: Area; line: Area } {
	const box = stageBox();
	if (isWide()) {
		const gap = css(28);
		const tableWidth = box.width * 0.4;
		return {
			table: { left: box.left, right: box.left + tableWidth, top: box.top, bottom: box.bottom },
			line: {
				left: box.left + tableWidth + gap,
				right: box.right,
				top: box.top + box.height * 0.1,
				bottom: box.bottom - box.height * 0.12
			}
		};
	}
	const gap = css(20);
	const tableHeight = box.height * 0.44;
	return {
		table: { left: box.left, right: box.right, top: box.top, bottom: box.top + tableHeight },
		line: {
			left: box.left,
			right: box.right,
			top: box.top + tableHeight + gap,
			bottom: box.bottom - box.height * 0.08
		}
	};
}

function weatherPoints(
	chart: Chart,
	series: WeatherSeries,
	fromDay: number,
	toDay: number
): number[] {
	const points: number[] = [];
	if (toDay <= fromDay) return points;
	const weather = S.world.weather;
	const pixelsPerDay = (chart.right - chart.left) / (chart.dayEnd - chart.dayStart);
	const step = Math.max(1 / WEATHER_STEPS_PER_DAY, 1.5 / pixelsPerDay); // 1.5 기기 px 마다 한 점
	for (let day = fromDay; day < toDay; day += step)
		points.push(chartX(chart, day), chartY(chart, weatherX(weather, series, day)));
	points.push(chartX(chart, toDay), chartY(chart, weatherX(weather, series, toDay)));
	return points;
}

export function drawWeatherLine(
	chart: Chart,
	series: WeatherSeries,
	fromDay: number,
	toDay: number,
	color: Rgb,
	alpha: number,
	withHead: boolean
): void {
	const points = weatherPoints(chart, series, fromDay, toDay);
	strokePoints(points, color, alpha, 1.3);
	if (withHead && points.length >= 2)
		drawSprite(
			color === GOLD ? 'gold' : 'white',
			points[points.length - 2],
			points[points.length - 1],
			30,
			alpha
		);
}

/** 가운데 옅은 기준선 + 20일 간격 눈금(0일 이후만 숫자) */
export function drawDayAxis(chart: Chart, alpha: number): void {
	if (alpha <= 0) return;
	const context = S.context;
	context.strokeStyle = rgba(AXIS, 0.1 * alpha);
	context.lineWidth = css(1);
	context.beginPath();
	context.moveTo(chart.left, chartY(chart, 0));
	context.lineTo(chart.right, chartY(chart, 0));
	const firstTick = Math.ceil(Math.max(0, chart.dayStart) / DAY_TICK) * DAY_TICK;
	for (let day = firstTick; day <= chart.dayEnd; day += DAY_TICK) {
		const x = chartX(chart, day);
		context.moveTo(x, chart.bottom + css(6));
		context.lineTo(x, chart.bottom + css(11));
	}
	context.stroke();
	for (let day = firstTick; day <= chart.dayEnd; day += DAY_TICK) {
		drawLabel(
			day === chart.dayEnd ? `${day}일` : String(day),
			chartX(chart, day),
			chart.bottom + css(22),
			10,
			AXIS,
			0.55 * alpha
		);
	}
}

/** 두 날씨가 갈라진 날(|Δx|>1)에 파문. knots = 진행값 → 날 */
export function weatherRippleAt(chart: Chart, p: number, knots: Knots): void {
	const weather = S.world.weather;
	const splitDay = weather.splitDay;
	const splitP = inversePiecewise(knots, splitDay);
	const middle = (weatherX(weather, 'base', splitDay) + weatherX(weather, 'copy', splitDay)) / 2;
	drawRippleAt(chartX(chart, splitDay), chartY(chart, middle), (p - splitP) / RIPPLE_SPAN_P, 1);
}
