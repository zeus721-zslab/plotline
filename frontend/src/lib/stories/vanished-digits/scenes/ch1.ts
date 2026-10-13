// 1장 「열하루째」(시제품 :1461-1540): 날짜 칸이 열흘까지 켜지고(1-1), 칸들 위로 빛 실이 지나가고(1-2), 실이 한 점으로 모인다(1-3).
// 칸 수 · 칸 숫자는 데이터(신뢰 예보 열흘)를 따른다. 대조가 어긋나면 이 장 그림을 그리지 않는다.
import { applyBloom, drawSprite, GOLD, S, strokeFaded, WHITE } from '../chaosPaint.ts';
import { clamp01, lerp, rampP, smoothstep } from '../chaosScene.ts';
import { beatAt } from '../chapters.ts';
import {
	CALENDAR_SLOTS_FIRST,
	calendarEdgeMask,
	calendarLayout,
	drawCalendarBox,
	type CalendarLayout
} from './calendar.ts';

// 칸들 위를 지나가는 빛 실: 로렌츠 x 시계열 조각(기준 궤적의 서로 다른 구간)
const THREAD_STARTS = [700, 1900, 3050, 4300, 5550, 6900, 8250]; // 기준 궤적 걸음
const THREAD_SPAN_STEPS = 700; // 화면 너비에 담기는 걸음 수
const THREAD_POINTS = 140;
const THREAD_STAGGER = 0.05; // 가닥마다 출발 진행값 차이
const THREAD_TRAVEL = 0.42; // 머리가 화면을 가로지르는 진행값 폭
const THREAD_FLOW_STEPS_PER_S = 22;
const THREAD_HEAD_END = 1.02; // 머리가 화면 오른쪽 끝을 지난 자리(너비 배수)
// x 를 칸 높이 반에 맞추는 눈금(x 약 ±20)
const THREAD_X_SCALE = 20;

function mainXAt(step: number): number {
	const main = S.world.main;
	const steps = main.length / 3 - 1;
	const wrapped = ((step % steps) + steps) % steps;
	const index = Math.floor(wrapped);
	const fraction = wrapped - index;
	return lerp(main[index * 3], main[(index + 1) * 3], fraction);
}

function threadPoints(
	layout: CalendarLayout,
	thread: number,
	shift: number,
	headX: number
): number[] {
	const points: number[] = [];
	const lane = (thread - (THREAD_STARTS.length - 1) / 2) * layout.boxHeight * 0.07;
	for (let k = 0; k <= THREAD_POINTS; k++) {
		const x = (S.width * k) / THREAD_POINTS;
		const y =
			layout.cy +
			lane -
			(mainXAt(THREAD_STARTS[thread] + (k / THREAD_POINTS) * THREAD_SPAN_STEPS + shift) /
				THREAD_X_SCALE) *
				layout.boxHeight *
				0.5;
		if (x >= headX) {
			if (k > 0) {
				const previousX = points[points.length - 2];
				const previousY = points[points.length - 1];
				points.push(headX, lerp(previousY, y, (headX - previousX) / (x - previousX)));
			}
			break;
		}
		points.push(x, y);
	}
	return points;
}

function threadAlpha(layout: CalendarLayout, lastDay: number, x: number, headX: number): number {
	return (
		calendarEdgeMask(layout, x, lastDay) *
		(0.35 + 0.65 * smoothstep(headX - S.width * 0.5, headX, x))
	);
}

function threadShift(
	base: number,
	p: number,
	span: number,
	seconds: number,
	alive: boolean
): number {
	return base + p * span + (alive ? seconds * THREAD_FLOW_STEPS_PER_S : 0);
}

export function paint11(p: number): void {
	const calendar = S.figures.calendar;
	if (calendar === null) return;
	const days = calendar.reliableDays;
	const layout = calendarLayout(CALENDAR_SLOTS_FIRST);
	const first = beatAt('1-1', 1, 0.1);
	const last = beatAt('1-1', 3, 0.9);
	for (let day = 1; day <= days; day++) {
		const on = lerp(first, last, (day - 1) / (days - 1));
		const lit = smoothstep(on, on + 0.02, p);
		drawCalendarBox(layout, day, lit, lit);
	}
	applyBloom(0.6);
}

export function paint12(p: number, seconds: number, alive: boolean): void {
	const calendar = S.figures.calendar;
	if (calendar === null) return;
	const days = calendar.reliableDays;
	const layout = calendarLayout(CALENDAR_SLOTS_FIRST);
	for (let day = 1; day <= days; day++) drawCalendarBox(layout, day, 0.75, 1);
	const shift = threadShift(0, p, 260, seconds, alive);
	const start = beatAt('1-2', 0, 0.2);
	for (let thread = 0; thread < THREAD_STARTS.length; thread++) {
		const travel = clamp01((p - start - thread * THREAD_STAGGER) / THREAD_TRAVEL);
		if (travel <= 0) continue;
		const headX = lerp(0, S.width * THREAD_HEAD_END, travel);
		const points = threadPoints(layout, thread, shift, headX);
		strokeFaded(points, thread % 2 === 0 ? GOLD : WHITE, 0.62, 1.1, (x) =>
			threadAlpha(layout, days, x, headX)
		);
		if (travel < 1 && points.length >= 2)
			drawSprite(
				thread % 2 === 0 ? 'gold' : 'white',
				headX,
				points[points.length - 1],
				24,
				0.85 * calendarEdgeMask(layout, headX, days)
			);
	}
	applyBloom(0.7);
}

export function paint13(p: number, seconds: number, alive: boolean): void {
	const calendar = S.figures.calendar;
	if (calendar === null) return;
	const days = calendar.reliableDays;
	const layout = calendarLayout(CALENDAR_SLOTS_FIRST);
	const off = rampP(p, beatAt('1-3', 2, 0.1), beatAt('1-3', 3, 0.5));
	for (let day = 1; day <= days; day++) drawCalendarBox(layout, day, 0.75 * (1 - off), 1 - off);
	const gather = rampP(p, beatAt('1-3', 2, 0.3), beatAt('1-3', 3, 0.9));
	const centerX = S.width / 2;
	const centerY = layout.cy;
	const shift = threadShift(260, p, 80, seconds, alive);
	const headX = S.width * THREAD_HEAD_END;
	for (let thread = 0; thread < THREAD_STARTS.length; thread++) {
		const points = threadPoints(layout, thread, shift, headX);
		for (let index = 0; index < points.length; index += 2) {
			points[index] = lerp(points[index], centerX, gather);
			points[index + 1] = lerp(points[index + 1], centerY, gather);
		}
		// 밝기는 모이기 전 자리(점 번호)로 정한다 → 열 번째 칸 너머는 모여도 어둡다
		strokeFaded(
			points,
			thread % 2 === 0 ? GOLD : WHITE,
			0.62 * (1 - 0.5 * gather),
			1.1,
			(_x, _y, pointIndex) =>
				threadAlpha(layout, days, (S.width * pointIndex) / THREAD_POINTS, headX)
		);
	}
	const point = smoothstep(0.55, 1, gather);
	drawSprite(
		'gold',
		centerX,
		centerY,
		54,
		point * (alive ? 0.85 + 0.15 * Math.sin(seconds * 2.2) : 1)
	);
	drawSprite('white', centerX, centerY, 30, point);
	applyBloom(0.8);
}
