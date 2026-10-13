// 7장 「쉰한 개의 내일」 시그니처 밖 비트(시제품 :2607-2681): 열하루째 너머 칸들(7-3) · 열나흘째 너머로 이어지는 끌개 꼬리(7-4) ·
// 노을 진 마을과 비 오는 마을 사이를 지나는 꼬리(7-5). 7-1 · 7-2 는 시그니처 C(signature.ts). 칸 수 · 칸 숫자는 데이터를 따른다.
import {
	addTrail,
	applyBloom,
	css,
	depthBright,
	drawHeadGlow,
	drawSprite,
	flushTrails,
	headPoint,
	makeView,
	moveFrame,
	nearness,
	projectedBox,
	S,
	setFrame,
	WARM_GOLD_AT,
	WHITE
} from '../chaosPaint.ts';
import { lerp, rampP, smoothstep } from '../chaosScene.ts';
import { beatAt } from '../chapters.ts';
import {
	CALENDAR_SLOTS_BEYOND,
	CALENDAR_SLOTS_FIRST,
	CALENDAR_SLOTS_LATER,
	calendarLayout,
	drawCalendarBox
} from './calendar.ts';
import { drawValley, valleyRects } from './valley.ts';

const FAR_DAY_LEVELS = [0.6, 0.42, 0.26, 0.14]; // 열하루째~열나흘째 칸 밝기(점점 흐려진다)
const FAR_DAY_BORDERS = [0.8, 0.5, 0.25, 0]; // 마지막 칸은 경계선 없이 녹는다
const FAR_TAIL_STEPS = 700;

/** 신뢰 예보 다음 날부터 한계 날까지의 칸 수(밝기 단계 수를 넘지 않는다) */
function farDayCount(reliableDays: number, limitDays: number): number {
	return Math.min(FAR_DAY_LEVELS.length, limitDays - reliableDays);
}

/** 정면 시점 끌개 꼬리 한 줄기(7-4 · 7-5 · 끝 화면): head 걸음까지 tail 걸음, 투영 가운데 (cx, cy), 높이 heightPx */
export function drawFrontTail(
	head: number,
	tail: number,
	cx: number,
	cy: number,
	heightPx: number,
	style: (fresh: number, index: number) => { alpha: number; width: number }
): void {
	const main = S.world.main;
	const view = makeView(0, 0);
	const projected = projectedBox(view);
	setFrame(view, heightPx / (projected.maxV - projected.minV));
	moveFrame(cx, cy);
	addTrail(main, head - tail, head, 4, (age, index) => {
		const fresh = 1 - age / tail;
		if (fresh <= 0) return null;
		const look = style(fresh, index);
		return { alpha: look.alpha, warm: WARM_GOLD_AT * (1 - fresh), width: look.width };
	});
	flushTrails();
}

/** 끌개 위를 도는 꼬리 머리 걸음(진행값 + 살아 있을 때 시간). 기준 궤적 끝을 넘으면 처음으로 돌아간다 */
export function loopingHead(base: number, tail: number): number {
	const mainSteps = S.world.main.length / 3 - 1;
	return tail + (base % (mainSteps - tail - 1));
}

export function paint73(p: number): void {
	const calendar = S.figures.calendar;
	if (calendar === null) return;
	const { reliableDays, limitDays } = calendar;
	const appear = rampP(p, 0, beatAt('7-3', 0, 0.35));
	const layout = calendarLayout(
		lerp(
			CALENDAR_SLOTS_FIRST,
			CALENDAR_SLOTS_LATER,
			rampP(p, beatAt('7-3', 0, 0.2), beatAt('7-3', 0, 0.95))
		)
	);
	for (let day = 1; day <= reliableDays; day++) drawCalendarBox(layout, day, 0.6 * appear, appear);
	const times = [
		beatAt('7-3', 1, 0.3),
		beatAt('7-3', 2, 0.4),
		beatAt('7-3', 3, 0.35),
		beatAt('7-3', 3, 0.75)
	];
	const far = farDayCount(reliableDays, limitDays);
	for (let k = 0; k < far; k++) {
		const on = smoothstep(times[k], times[k] + 0.03, p);
		drawCalendarBox(
			layout,
			reliableDays + 1 + k,
			FAR_DAY_LEVELS[k] * on,
			FAR_DAY_BORDERS[k] * on,
			k === far - 1
		);
	}
	applyBloom(0.6);
}

export function paint74(p: number, seconds: number, alive: boolean): void {
	const calendar = S.figures.calendar;
	if (calendar === null) return;
	const { reliableDays, limitDays } = calendar;
	const up = rampP(p, beatAt('7-4', 1, 0), beatAt('7-4', 1, 0.4));
	const down = rampP(p, beatAt('7-4', 1, 0.55), beatAt('7-4', 2, 0.3));
	const slots = lerp(
		CALENDAR_SLOTS_LATER,
		CALENDAR_SLOTS_BEYOND,
		rampP(p, 0, beatAt('7-4', 0, 0.9))
	);
	// 열하루째~열나흘째 칸 밝기 배율: 희미하게 켜졌다 흐려진다
	const glimmer = lerp(lerp(1, 1.5, up), 0.45, down);
	const tail = rampP(p, beatAt('7-4', 2, 0.1), beatAt('7-4', 2, 0.7));
	const layout = calendarLayout(slots);
	for (let day = 1; day <= reliableDays; day++) drawCalendarBox(layout, day, 0.6, 1);
	const far = farDayCount(reliableDays, limitDays);
	for (let k = 0; k < far; k++)
		drawCalendarBox(
			layout,
			reliableDays + 1 + k,
			FAR_DAY_LEVELS[k] * glimmer,
			FAR_DAY_BORDERS[k] * Math.min(1, glimmer),
			k === far - 1
		);
	if (tail > 0) {
		// 열나흘째 너머로 끌개 빛 꼬리가 이어진다(사라지지 않는다). 정면 시점, 칸 높이의 2.2배
		const main = S.world.main;
		const edge = layout.boxLeft(limitDays) + layout.boxWidth;
		const head = loopingHead(
			1200 + p * 1600 - FAR_TAIL_STEPS + (alive ? seconds * 40 : 0),
			FAR_TAIL_STEPS
		);
		drawFrontTail(
			head,
			FAR_TAIL_STEPS,
			edge + (S.width - edge) * 0.5 + css(10),
			layout.cy,
			layout.boxHeight * 2.2,
			(fresh, index) => ({
				alpha: tail * 0.5 * fresh * fresh * depthBright(nearness(main, index)),
				width: 0.8 + 0.9 * fresh
			})
		);
		drawHeadGlow(main, head, 30, WHITE, tail);
		const [x, y] = headPoint(main, head);
		drawSprite('white', x, y, 26, tail);
	}
	applyBloom(0.6);
}

export function paint75(p: number, seconds: number, alive: boolean): void {
	const main = S.world.main;
	const alpha = rampP(p, 0, beatAt('7-5', 0, 0.4));
	const dusk = rampP(p, beatAt('7-5', 0, 0.3), beatAt('7-5', 1, 0.6));
	const [upper, lower] = valleyRects();
	drawValley(
		upper,
		{ clear: 1, rain: 0, dusk, night: 0, village: 1, label: null, alpha },
		seconds,
		alive,
		p
	);
	drawValley(
		lower,
		{ clear: 0, rain: 1, dusk: 0, night: 0, village: 1, label: null, alpha },
		seconds,
		alive,
		p
	);
	// 두 하늘 사이를 천천히 지나가는 끌개 빛 꼬리(정면 시점)
	const head = loopingHead(2000 + p * 2400 + (alive ? seconds * 30 : 0), FAR_TAIL_STEPS);
	drawFrontTail(
		head,
		FAR_TAIL_STEPS,
		lerp(-S.width * 0.15, S.width * 1.15, p),
		(upper.top + upper.height + lower.top) / 2,
		S.height * 0.16,
		(fresh, index) => ({
			alpha: alpha * 0.55 * fresh * fresh * depthBright(nearness(main, index)),
			width: 0.8 + 1 * fresh
		})
	);
	drawHeadGlow(main, head, 30, WHITE, alpha);
	applyBloom(0.3);
	const [x, y] = headPoint(main, head);
	drawSprite('white', x, y, 30, alpha);
}
