// 블랙홀 단면 지도 그리기 도구(Canvas 2D): 띠 · 이름표 · 여행자 · 화살표. 상태 없이 받은 값만 그린다.
// 띠 색: 바깥 푸른빛 → 안정 궤도 청록 → 광자구 금빛 → 작용권 보라 → 지평선 붉은 테두리 → 안쪽 검붉음 → 중심 흰 점.
// 색만으로 구분하지 않도록 지금 장의 띠는 굵은 선 + 이름표, 실제 경계가 아닌 그림자는 점선으로 그린다.
import type { MapLayout, MapRing } from './mapLayout.ts';
import type { BoundaryId } from './holeData.ts';

export type Point = { x: number; y: number };
// 화면 중심과 지평선 1배의 화면 길이(CSS px)
export type View = { center: Point; unitPx: number };
// 화면 위 사각 영역(CSS px). 지도 구도 영역 · 신호 띠.
export type Rect = { x: number; y: number; width: number; height: number };

export const FULL_TURN = Math.PI * 2;
const OUTER_RGB = '90, 140, 255';
export const RING_RGB: Record<BoundaryId, string> = {
	isco: '70, 210, 200',
	shadow: '220, 225, 235',
	photon_sphere: '255, 200, 90',
	ergosphere: '160, 110, 240',
	horizon: '235, 70, 60'
};
const INSIDE_RGB = '60, 8, 10';
const CENTER_RGB = '255, 255, 255';
const LABEL_FONT = '600 13px "IBM Plex Sans KR", system-ui, sans-serif';
const FOCUS_LINE_PX = 3;
const DIM_LINE_PX = 1;
const DIM_ALPHA = 0.35;
const SHADOW_DASH: [number, number] = [6, 6];
const CENTER_DOT_PX = 2.5;
// 여행자 점 크기 · 손전등 빛 번짐 반지름(CSS px)
const TRAVELER_PX = 4;
const HALO_PX = 18;
// 화살표: 바깥 원에서 중심 쪽으로 이 비율 지점까지, 머리 길이(px) · 머리 벌어짐(라디안)
const ARROW_INNER_SHARE = 0.55;
const ARROW_HEAD_PX = 7;
const ARROW_HEAD_SPREAD = 0.45;

export function ringPx(view: View, radius: number): number {
	return radius * view.unitPx;
}

export function polar(view: View, radius: number, angle: number): Point {
	return {
		x: view.center.x + Math.cos(angle) * radius * view.unitPx,
		y: view.center.y + Math.sin(angle) * radius * view.unitPx
	};
}

function circle(context: CanvasRenderingContext2D, center: Point, radiusPx: number): void {
	context.beginPath();
	context.arc(center.x, center.y, Math.max(0, radiusPx), 0, FULL_TURN);
}

/** 가장 바깥 안정 궤도 밖의 푸른빛(멀리서 본 블랙홀 둘레) */
function paintOuterGlow(context: CanvasRenderingContext2D, view: View, layout: MapLayout): void {
	const isco = layout.get('isco');
	const inner = ringPx(view, isco === undefined ? 3 : isco.radius);
	const glow = context.createRadialGradient(
		view.center.x,
		view.center.y,
		inner,
		view.center.x,
		view.center.y,
		inner * 4
	);
	glow.addColorStop(0, `rgba(${OUTER_RGB}, 0.22)`);
	glow.addColorStop(1, `rgba(${OUTER_RGB}, 0)`);
	context.fillStyle = glow;
	circle(context, view.center, inner * 4);
	context.fill();
}

/** 작용권 표시 띠(지평선 ~ 표시 반지름)와 지평선 안 검붉은 면 */
function paintFills(context: CanvasRenderingContext2D, view: View, layout: MapLayout): void {
	const horizon = layout.get('horizon');
	const ergosphere = layout.get('ergosphere');
	if (ergosphere !== undefined && horizon !== undefined) {
		context.fillStyle = `rgba(${RING_RGB.ergosphere}, 0.18)`;
		circle(context, view.center, ringPx(view, ergosphere.radius));
		context.arc(view.center.x, view.center.y, ringPx(view, horizon.radius), 0, FULL_TURN, true);
		context.fill();
	}
	if (horizon !== undefined) {
		context.fillStyle = `rgb(${INSIDE_RGB})`;
		circle(context, view.center, ringPx(view, horizon.radius));
		context.fill();
	}
}

function paintRing(
	context: CanvasRenderingContext2D,
	view: View,
	ring: MapRing,
	focused: boolean
): void {
	context.save();
	context.strokeStyle = `rgba(${RING_RGB[ring.id]}, ${focused ? 1 : DIM_ALPHA})`;
	context.lineWidth = focused ? FOCUS_LINE_PX : DIM_LINE_PX;
	if (!ring.physical) context.setLineDash(SHADOW_DASH);
	if (focused) {
		context.shadowColor = `rgba(${RING_RGB[ring.id]}, 0.8)`;
		context.shadowBlur = 12;
	}
	circle(context, view.center, ringPx(view, ring.radius));
	context.stroke();
	context.restore();
}

/** 띠 위쪽에 이름표(데이터 name_ko). 지도 영역 위로 벗어나면 minY(영역 윗변 바로 아래)로 내린다. 그린 글의 아랫줄 y 를 돌려준다. */
export function paintLabel(
	context: CanvasRenderingContext2D,
	view: View,
	ring: MapRing,
	alpha: number,
	minY: number
): number {
	const y = Math.max(minY, view.center.y - ringPx(view, ring.radius) - 10);
	context.save();
	context.globalAlpha = alpha;
	context.font = LABEL_FONT;
	context.textAlign = 'center';
	context.textBaseline = 'bottom';
	context.lineWidth = 4;
	context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
	context.strokeText(ring.nameKo, view.center.x, y);
	context.fillStyle = `rgb(${RING_RGB[ring.id]})`;
	context.fillText(ring.nameKo, view.center.x, y);
	context.restore();
	return y;
}

/** 지도 전체: 바깥 빛 · 띠 면 · 경계 선 · 중심 흰 점 · 지금 장 이름표. 이름표 아랫줄 y(이름표가 없으면 null)를 돌려준다. */
export function paintMap(
	context: CanvasRenderingContext2D,
	view: View,
	layout: MapLayout,
	focus: BoundaryId | null,
	alpha: number,
	labelMinY: number
): number | null {
	context.save();
	context.globalAlpha = alpha;
	paintOuterGlow(context, view, layout);
	paintFills(context, view, layout);
	for (const ring of layout.values()) {
		if (ring.id !== 'ergosphere') paintRing(context, view, ring, ring.id === focus);
	}
	const ergosphere = layout.get('ergosphere');
	if (ergosphere !== undefined) paintRing(context, view, ergosphere, focus === 'ergosphere');
	context.fillStyle = `rgb(${CENTER_RGB})`;
	circle(context, view.center, CENTER_DOT_PX);
	context.fill();
	context.restore();
	const focused = focus === null ? undefined : layout.get(focus);
	return focused === undefined ? null : paintLabel(context, view, focused, alpha, labelMinY);
}

/** 여행자 점. stretch 는 세로로 늘어난 정도(1 = 점), blink 는 손전등 빛 세기(0~1). */
export function paintTraveler(
	context: CanvasRenderingContext2D,
	at: Point,
	stretch: number,
	blink: number
): void {
	if (blink > 0) {
		const halo = context.createRadialGradient(at.x, at.y, 0, at.x, at.y, HALO_PX);
		halo.addColorStop(0, `rgba(255, 250, 235, ${0.75 * blink})`);
		halo.addColorStop(1, 'rgba(255, 250, 235, 0)');
		context.fillStyle = halo;
		context.fillRect(at.x - HALO_PX, at.y - HALO_PX, HALO_PX * 2, HALO_PX * 2);
	}
	// 세로로 늘어나는 만큼 가로는 가늘어진다.
	const width = TRAVELER_PX / Math.sqrt(stretch);
	const height = TRAVELER_PX * stretch;
	context.fillStyle = 'rgb(255, 255, 255)';
	context.beginPath();
	context.ellipse(at.x, at.y, width, height, 0, 0, FULL_TURN);
	context.fill();
}

/** 바깥 원에서 중심을 향하는 화살표(지평선 안: 어느 쪽으로 가도 중심) */
export function paintInwardArrows(
	context: CanvasRenderingContext2D,
	view: View,
	outerPx: number,
	count: number,
	alpha: number
): void {
	context.save();
	context.strokeStyle = `rgba(255, 170, 150, ${alpha})`;
	context.fillStyle = `rgba(255, 170, 150, ${alpha})`;
	context.lineWidth = 2;
	for (let index = 0; index < count; index += 1) {
		const angle = (index / count) * FULL_TURN;
		const from = { x: Math.cos(angle) * outerPx, y: Math.sin(angle) * outerPx };
		const to = { x: from.x * ARROW_INNER_SHARE, y: from.y * ARROW_INNER_SHARE };
		context.beginPath();
		context.moveTo(view.center.x + from.x, view.center.y + from.y);
		context.lineTo(view.center.x + to.x, view.center.y + to.y);
		context.stroke();
		const head = ARROW_HEAD_PX;
		const back = angle + Math.PI;
		context.beginPath();
		context.moveTo(view.center.x + to.x, view.center.y + to.y);
		context.lineTo(
			view.center.x + to.x - Math.cos(back - ARROW_HEAD_SPREAD) * head,
			view.center.y + to.y - Math.sin(back - ARROW_HEAD_SPREAD) * head
		);
		context.lineTo(
			view.center.x + to.x - Math.cos(back + ARROW_HEAD_SPREAD) * head,
			view.center.y + to.y - Math.sin(back + ARROW_HEAD_SPREAD) * head
		);
		context.closePath();
		context.fill();
	}
	context.restore();
}

/** paintTag 글의 폭(px). 글을 오른쪽 끝에 맞추거나 화면 밖으로 나가지 않게 놓을 때 쓴다. */
export function tagWidth(context: CanvasRenderingContext2D, text: string): number {
	context.save();
	context.font = LABEL_FONT;
	const width = context.measureText(text).width;
	context.restore();
	return width;
}

/** 화면 위에 짧은 글(7장 신호 띠 · 여행자 손전등 설명). x · y 는 글의 왼쪽 위 */
export function paintTag(
	context: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	alpha: number
): void {
	context.save();
	context.globalAlpha = alpha;
	context.font = LABEL_FONT;
	context.textAlign = 'left';
	context.textBaseline = 'top';
	context.lineWidth = 4;
	context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
	context.strokeText(text, x, y);
	context.fillStyle = 'rgb(238, 241, 248)';
	context.fillText(text, x, y);
	context.restore();
}
