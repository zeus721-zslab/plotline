// 끌개 ↔ 종이 한 장 ↔ 책(4-5 · 6-1 공용, 시제품 :2217-2276).
import {
	addTrail,
	css,
	depthBright,
	depthWidth,
	flushTrails,
	GOLD,
	MAIN_GROUP,
	makeView,
	moveFrame,
	nearness,
	projectedBox,
	rgba,
	S,
	setFrame,
	stageBox,
	strokePoints,
	WARM_GOLD_AT,
	WHITE,
	type Rgb,
	type View
} from '../chaosPaint.ts';
import { lerp, smoothstep } from '../chaosScene.ts';
import { viewAPitch, viewAYaw } from './signature.ts';

const PAPER_SCALE = 0.24; // 종이 한 장 크기일 때 끌개 배율
const BOOK_COVER: Rgb = [15, 16, 19];
const BOOK_PAGE_LINES = 4;

type BookGeometry = {
	view: View;
	spanU: number;
	spanV: number;
	paperHeight: number;
	bookWidth: number;
	bookHeight: number;
	bookTop: number;
};

export function bookGeometry(): BookGeometry {
	const box = stageBox();
	const view = makeView(viewAYaw(1), viewAPitch(1)); // 4-4 끝 시점
	const projected = projectedBox(view);
	const spanU = projected.maxU - projected.minU;
	const spanV = projected.maxV - projected.minV;
	const paperWidth = spanU * S.scales.A * PAPER_SCALE * 1.25;
	const paperHeight = spanV * S.scales.A * PAPER_SCALE * 1.2;
	return {
		view,
		spanU,
		spanV,
		paperHeight,
		bookWidth: paperWidth * 1.7,
		bookHeight: paperHeight * 1.3,
		bookTop: box.top + box.height * 0.55
	};
}

/** shrink 작아짐 · insert 책 속으로 · rest 빛 잦아듦 · book 책 보임 · brightness 끌개 밝기 · fade 전체(모두 0~1) */
export type BookLook = {
	shrink: number;
	insert: number;
	rest: number;
	book: number;
	brightness: number;
	fade: number;
};

export function drawBookScene({ shrink, insert, rest, book, brightness, fade }: BookLook): void {
	if (fade <= 0) return;
	const context = S.context;
	const main = S.world.main;
	const geometry = bookGeometry();
	const scale = lerp(S.scales.A, S.scales.A * PAPER_SCALE, shrink);
	const aboveY = geometry.bookTop - geometry.paperHeight * 0.62;
	const insideY = geometry.bookTop + geometry.bookHeight * 0.5;
	const centerY = lerp(lerp(S.height / 2, aboveY, shrink), insideY, insert);
	setFrame(geometry.view, scale);
	moveFrame(S.frame.cx, centerY);
	addTrail(main, 0, main.length / 3 - 1, MAIN_GROUP, (_age, index) => {
		const near = nearness(main, index);
		return {
			alpha: brightness * fade * depthBright(near),
			warm: WARM_GOLD_AT * 0.75,
			width: 1.05 * depthWidth(near)
		};
	});
	flushTrails();
	const paper = smoothstep(0.25, 0.75, shrink) * fade;
	const paperWidth = geometry.spanU * scale * 1.25;
	const paperHeight = geometry.spanV * scale * 1.2;
	if (paper > 0) {
		context.fillStyle = rgba(WHITE, 0.04 * paper);
		context.fillRect(
			S.width / 2 - paperWidth / 2,
			centerY - paperHeight / 2,
			paperWidth,
			paperHeight
		);
		context.strokeStyle = rgba(WHITE, 0.3 * paper);
		context.lineWidth = css(1);
		context.strokeRect(
			S.width / 2 - paperWidth / 2,
			centerY - paperHeight / 2,
			paperWidth,
			paperHeight
		);
	}
	if (book <= 0) return;
	// 책: 앞표지가 책 속의 종이를 가린다
	const left = S.width / 2 - geometry.bookWidth / 2;
	context.globalCompositeOperation = 'source-over';
	context.fillStyle = rgba(BOOK_COVER, book * fade);
	context.fillRect(left, geometry.bookTop, geometry.bookWidth, geometry.bookHeight);
	context.globalCompositeOperation = 'lighter';
	context.strokeStyle = rgba(GOLD, 0.45 * book * fade);
	context.lineWidth = css(1);
	context.strokeRect(left, geometry.bookTop, geometry.bookWidth, geometry.bookHeight);
	context.beginPath();
	context.moveTo(left + geometry.bookWidth * 0.07, geometry.bookTop);
	context.lineTo(left + geometry.bookWidth * 0.07, geometry.bookTop + geometry.bookHeight);
	context.stroke();
	context.strokeStyle = rgba(WHITE, 0.12 * book * fade);
	context.beginPath();
	for (let line = 1; line <= BOOK_PAGE_LINES; line++) {
		const y = geometry.bookTop - css(1.6 * line);
		context.moveTo(left + css(3 + line), y);
		context.lineTo(left + geometry.bookWidth - css(3 + line), y);
	}
	context.stroke();
	// 책장 사이로 새어 나오는 빛
	const leak = insert * (1 - 0.75 * rest) * fade * book;
	strokePoints(
		[
			S.width / 2 - paperWidth * 0.55,
			geometry.bookTop,
			S.width / 2 + paperWidth * 0.55,
			geometry.bookTop
		],
		GOLD,
		0.7 * leak,
		1.4
	);
}
