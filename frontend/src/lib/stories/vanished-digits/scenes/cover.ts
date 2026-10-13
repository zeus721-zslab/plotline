// 표지 · 끝 화면(시제품 :1325-1420). 숫자 · 제목은 페이지 DOM(표식)이 그리고, 캔버스는 빛점 · 두 실 · 끌개 꼬리만 그린다.
// 표지: 숫자가 빛점으로 줄고 그 자리에서 두 실(4-4 짝 계산의 벌어짐)이 나와 갈라진다. 끝 화면: 7-5 그림이 꺼지며 끌개 꼬리가 빛점으로 모인다.
import { PAIR_STEPS } from '../chaosCompute.ts';
import {
	applyBloom,
	css,
	depthBright,
	drawHeadGlow,
	drawSprite,
	GOLD,
	headPoint,
	isWide,
	nearness,
	S,
	strokePoints,
	WHITE,
	withAlpha
} from '../chaosPaint.ts';
import { COVER_STILL, coverState, finaleState, smoothstep } from '../chaosScene.ts';
import { drawFrontTail, loopingHead, paint75 } from './ch7.ts';

const COVER_THREAD_STRIDE = 3; // 걸음

/** 빛점 하나(표지 · 끝 화면) */
function drawMarkPoint(x: number, y: number, alpha: number, seconds: number, alive: boolean): void {
	drawSprite('gold', x, y, 46, alpha * (alive ? 0.88 + 0.12 * Math.sin(seconds * 1.8) : 1));
	drawSprite('white', x, y, 20, alpha);
}

/**
 * 두 실 = 4-4 짝 계산(x 를 0.000127 만큼 다르게 출발한 로렌츠 두 계산). 가로 = 걸음,
 * 세로 = 두 계산 사이 거리의 로그(chaosCompute coverSpread). spread 0~1 은 실이 뻗어 나온 정도
 */
function coverThreads(originX: number, originY: number, spread: number, appear: number): void {
	if (appear <= 0) return;
	const wide = isWide();
	const length = Math.min(S.width * 0.94 - originX, css(wide ? 560 : 300));
	const amplitude = css(wide ? 44 : 30);
	const headStep = spread * PAIR_STEPS;
	if (headStep <= 0) return;
	const coverSpread = S.world.coverSpread;
	const gold: number[] = [];
	const white: number[] = [];
	for (let step = 0; ; step = Math.min(headStep, step + COVER_THREAD_STRIDE)) {
		const index = Math.min(PAIR_STEPS, Math.floor(step));
		const half = (amplitude * coverSpread[index]) / 2;
		const x = originX + (step / PAIR_STEPS) * length;
		gold.push(x, originY - half);
		white.push(x, originY + half);
		if (step >= headStep) break;
	}
	strokePoints(gold, GOLD, 0.8 * appear, 1.2);
	strokePoints(white, WHITE, 0.85 * appear, 1.2);
	if (spread < 1) {
		drawSprite('gold', gold[gold.length - 2], gold[gold.length - 1], 22, 0.8 * appear);
		drawSprite('white', white[white.length - 2], white[white.length - 1], 18, 0.8 * appear);
	}
}

export function paintCover(p: number, seconds: number, alive: boolean): void {
	// alive 가 거짓이면 동작 줄이기 정지 그림(COVER_STILL)
	const state = alive ? coverState(p) : COVER_STILL;
	const mark = S.markPoint();
	if (alive) {
		drawMarkPoint(mark.x, mark.y, smoothstep(0.35, 1, state.shrink), seconds, alive);
		coverThreads(mark.x, mark.y, state.spread, smoothstep(0, 0.06, state.spread));
	} else {
		coverThreads(mark.stillX, mark.y, state.spread, 1);
	}
	applyBloom(0.6);
}

const FINALE_TAIL_STEPS = 700;
const FINALE_HEIGHT = 0.42; // 꼬리가 모이기 전 크기(화면 짧은 변 대비)

export function paintFinale(p: number, seconds: number, alive: boolean): void {
	const state = finaleState(p);
	if (state.valley > 0) withAlpha(state.valley, () => paint75(1, seconds, alive));
	const mark = S.markPoint();
	const main = S.world.main;
	const tail = Math.max(1, FINALE_TAIL_STEPS * (1 - state.gather));
	const head = loopingHead(3000 + p * 1500 + (alive ? seconds * 30 : 0), FINALE_TAIL_STEPS);
	if (state.gather < 1) {
		drawFrontTail(
			head,
			tail,
			mark.x,
			mark.y,
			Math.min(S.width, S.height) * FINALE_HEIGHT * (1 - state.gather),
			(fresh, index) => ({
				alpha: state.appear * 0.6 * fresh * fresh * depthBright(nearness(main, index)),
				width: 0.8 + 1 * fresh
			})
		);
		drawHeadGlow(main, head, Math.min(30, tail), WHITE, state.appear * (1 - state.gather));
	}
	applyBloom(0.5);
	drawMarkPoint(mark.x, mark.y, state.appear * smoothstep(0.4, 1, state.gather), seconds, alive);
	const [x, y] = headPoint(main, head);
	drawSprite('white', x, y, 26, state.appear * (1 - smoothstep(0.6, 1, state.gather)));
}
