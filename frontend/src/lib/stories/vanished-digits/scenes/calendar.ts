// 날짜 칸(1장 · 7장 공용, 시제품 :1422-1459). 칸 수와 칸 숫자는 데이터(신뢰 예보 열흘 · 한계 열나흘, chaosData screenFigures)에서 읽는다.
import {
	css,
	drawLabel,
	drawSprite,
	GOLD,
	rgba,
	roundedRectPath,
	S,
	WHITE
} from '../chaosPaint.ts';
import { smoothstep } from '../chaosScene.ts';

/** 1장: 열 칸이 화면 너비를 채운다 · 7-3: 열나흘째까지 보이게 물러선다 · 7-4: 열나흘째 너머 자리까지 */
export const CALENDAR_SLOTS_FIRST = 10.6;
export const CALENDAR_SLOTS_LATER = 15.2;
export const CALENDAR_SLOTS_BEYOND = 17;

export type CalendarLayout = {
	slot: number;
	boxWidth: number;
	boxHeight: number;
	cy: number;
	top: number;
	boxLeft: (day: number) => number;
};

export function calendarLayout(visibleSlots: number): CalendarLayout {
	const usable = S.width * 0.88;
	const slot = usable / visibleSlots;
	const boxWidth = slot * 0.8;
	const boxHeight = Math.min(boxWidth * 1.35, S.height * 0.3);
	const left = (S.width - usable) / 2 + (slot - boxWidth) / 2;
	const cy = S.height * 0.5;
	return {
		slot,
		boxWidth,
		boxHeight,
		cy,
		top: cy - boxHeight / 2,
		boxLeft: (day) => left + (day - 1) * slot
	};
}

/** 날짜 칸 하나. lit 켜짐 · border 테두리(0~1). melt 이면 테두리 없이 오른쪽으로 갈수록 어둠에 녹는다 */
export function drawCalendarBox(
	layout: CalendarLayout,
	day: number,
	lit: number,
	border: number,
	melt = false
): void {
	if (lit <= 0 && border <= 0) return;
	const context = S.context;
	const x = layout.boxLeft(day);
	const y = layout.top;
	const w = layout.boxWidth;
	const h = layout.boxHeight;
	if (melt) {
		const gradient = context.createLinearGradient(x, 0, x + w * 1.8, 0);
		gradient.addColorStop(0, rgba(GOLD, 0.08 * lit));
		gradient.addColorStop(1, rgba(GOLD, 0));
		context.fillStyle = gradient;
		context.fillRect(x, y, w * 1.8, h);
	} else {
		roundedRectPath(x, y, w, h, Math.min(w, h) * 0.12);
		context.fillStyle = rgba(GOLD, 0.07 * lit);
		context.fill();
		context.strokeStyle = rgba(GOLD, (0.12 + 0.5 * lit) * border);
		context.lineWidth = css(1);
		context.stroke();
	}
	drawLabel(
		String(day),
		x + w / 2,
		y + h * 0.3,
		Math.max(9, Math.min(16, (w / S.dpr) * 0.36)),
		WHITE,
		(0.2 + 0.7 * lit) * Math.min(1, (lit + border) * 2)
	);
	drawSprite('gold', x + w / 2, y + h * 0.68, (w / S.dpr) * 0.55, 0.45 * lit);
}

/** lastDay 번째 칸 오른쪽 끝을 지나면 어두워진다 */
export function calendarEdgeMask(layout: CalendarLayout, x: number, lastDay: number): number {
	const edge = layout.boxLeft(lastDay) + layout.boxWidth;
	return 1 - smoothstep(edge, edge + layout.slot * 1.3, x);
}
