// 넘을 수 없는 선 배경 렌더러(시제품 flow.src.html 프레임 :4667-4716 · 시작 :4905-4932). resize / render 만 밖에 내놓는다.
// 화면 한 장(Canvas 2D)에 장면을 그리고, 8장 물결만 그 아래 WebGL 캔버스가 그린다(없으면 Canvas 정지 물빛 무늬).
// 장 사이 암전 구간의 앞뒤 40% 는 앞 장 · 다음 장이 서서히 꺼지고 켜진다. 정지 그림(동작 줄이기 · 저사양)은 비트마다 진행값 0.85 한 장.
import { chapter2 } from './chapters/ch2.ts';
import { chapter3 } from './chapters/ch3.ts';
import { chapter4, chapter4PrewarmTasks } from './chapters/ch4.ts';
import { chapter5 } from './chapters/ch5.ts';
import { chapter6, resetChapter6Shake } from './chapters/ch6.ts';
import { resetChapter7Shake, scene2 } from './chapters/ch7.ts';
import { bindWave, scene3 } from './chapters/ch8.ts';
import { chapter9 } from './chapters/ch9.ts';
import { scene1 } from './chapters/ch1.ts';
import { buildGrain, geometry, rebuildLayers } from './lineLayers.ts';
import {
	bindContext,
	clearRibbonCache,
	clearTextCache,
	context2d,
	ctx,
	dpr,
	H,
	RED,
	rgba,
	setFrameMode,
	setGeometry,
	setViewport,
	sizeKey,
	smooth,
	W,
	type HiddenMarks
} from './linePaint.ts';
import { BEAT_COUNT_OF_CHAPTER, type TrackState } from './lineScene.ts';
import { initWaveGl, noteWaveFrame, resizeWaveGl, type WaveGl } from './waveGl.ts';

export type { HiddenMarks } from './linePaint.ts';

export const MAX_DPR = 2;
// 동작 줄이기 · 저사양 정지 그림: 비트마다 이 진행값, 맥박(sin)이 밝은 쪽에 멈추도록 고른 고정 시각(초)
export const STILL_P = 0.85;
export const STILL_TIME = 0.65;
const FADE_SPAN = 0.4; // 암전 구간의 앞뒤 40% 는 장면이 서서히 꺼지고 켜진다
const WATER_CHAPTER = 8;
// 4장 미리 그리기: 3장 후반(3장 진행 s ≥ 1.5, 3-2 후반부터)에 유휴 시간에 한다
const PREWARM_CHAPTER = 3;
const PREWARM_FROM_S = 1.5;
const IDLE_MIN_MS = 4;
const PREWARM_FALLBACK_MS = 16;
// 표지 기준선: 화면 폭 전체를 가로지르는 붉은 선 하나(색은 1-5 · 9-1 레이저의 붉은 심 laserPasses 와 같은 계열).
// 불투명도는 0.22 를 가운데로 0.18~0.26 을 8초 주기로 오가고, 위아래 약 3px 만 아주 옅게 번진다.
const COVER_LINE_COLOR = 'rgb(255,72,52)';
const COVER_LINE_ALPHA = 0.22;
const COVER_PULSE_AMPLITUDE = 0.04;
const COVER_PULSE_PERIOD_S = 8;
const COVER_LINE_PX = 1;
const COVER_GLOW_PX = 3;
const COVER_GLOW_STRENGTH = 0.35; // 번짐 가운데 진하기(선 불투명도 대비)
// 표지 진행값 c 의 절반부터 끝까지 선이 사라진다
const COVER_FADE_FROM = 0.5;
const COVER_FADE_TO = 1;

/** 표지 구간에서만 페이지가 넘긴다. y: 표지 안 표시 요소(.cover-line)의 화면 y(px), c: 표지 진행값(0~1) */
export type CoverLine = { y: number; c: number };

type ChapterScene = (s: number, local: number, t: number, fade: number) => void;
const CHAPTER_SCENES: Record<number, ChapterScene> = {
	1: (s, local, t) => scene1(s, local, t, null),
	2: chapter2,
	3: chapter3,
	4: chapter4,
	5: chapter5,
	6: chapter6,
	7: scene2,
	8: scene3,
	9: chapter9
};

export type LineRenderer = {
	/** 화면 크기가 바뀌었을 때: 캔버스 · 미리 그린 것을 다시 만든다 */
	resize: () => void;
	/** 한 프레임. t: 초(정지 그림은 STILL_TIME), still: 정지 그림, marks: 문구 대조로 숨길 점수 숫자, cover: 표지 구간이면 기준선 위치 */
	render: (
		state: TrackState,
		t: number,
		still: boolean,
		marks: HiddenMarks,
		cover: CoverLine | null
	) => void;
	/** 물 장면이 보이는 동안의 프레임 간격(ms): 느리면 WebGL 해상도를 낮춘다 */
	noteFrame: (frameMs: number) => void;
	hasWebGl: boolean;
	dispose: () => void;
};

export function createLineRenderer(
	canvas: HTMLCanvasElement,
	waterCanvas: HTMLCanvasElement
): LineRenderer {
	bindContext(context2d(canvas));
	const wave: WaveGl | null = initWaveGl(waterCanvas);
	bindWave(wave);
	const grain = buildGrain();
	let waterVisible = false;
	let prewarmedFor = '';
	let idleHandle = 0;
	let timerHandle = 0;

	function setWaterVisible(visible: boolean): void {
		if (visible === waterVisible) return;
		waterVisible = visible;
		waterCanvas.style.visibility = visible ? 'visible' : 'hidden';
	}

	function drawSceneAt(chapter: number, s: number, local: number, t: number, fade: number): void {
		setWaterVisible(chapter === WATER_CHAPTER && wave !== null);
		// 다른 장에서 7-2 · 6-2 뒤로 곧장 건너뛸 때는 흔들지 않는다
		if (chapter !== 7) resetChapter7Shake();
		if (chapter !== 6) resetChapter6Shake();
		CHAPTER_SCENES[chapter](s, local, t, fade);
		if (chapter !== WATER_CHAPTER && fade < 1) {
			ctx.globalCompositeOperation = 'source-over';
			ctx.globalAlpha = 1 - fade;
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, W, H);
		}
	}

	// 표지: 검은 바탕에 기준선 하나. 정지 모드는 불투명도 0.22 고정(맥박 · 사라짐 없음)
	function drawCover(cover: CoverLine, t: number, still: boolean): void {
		setWaterVisible(false);
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, W, H);
		const pulse = still
			? 0
			: COVER_PULSE_AMPLITUDE * Math.sin((2 * Math.PI * t) / COVER_PULSE_PERIOD_S);
		const fade = still ? 1 : 1 - smooth(COVER_FADE_FROM, COVER_FADE_TO, cover.c);
		const alpha = (COVER_LINE_ALPHA + pulse) * fade;
		const alphaText = alpha.toFixed(3);
		// 측정용 표지(화면 확인이 지금 선 불투명도를 읽는다, 동작 무관)
		if (canvas.dataset.coverAlpha !== alphaText) canvas.dataset.coverAlpha = alphaText;
		if (alpha <= 0) return;
		// 선 윗변을 기기 화소에 맞춰 1px 선이 두 줄로 번지지 않게 한다(선 가운데 = cover.y)
		const top = Math.round((cover.y - COVER_LINE_PX / 2) * dpr) / dpr;
		const center = top + COVER_LINE_PX / 2;
		const glow = ctx.createLinearGradient(0, center - COVER_GLOW_PX, 0, center + COVER_GLOW_PX);
		glow.addColorStop(0, rgba(RED, 0));
		glow.addColorStop(0.5, rgba(RED, COVER_GLOW_STRENGTH));
		glow.addColorStop(1, rgba(RED, 0));
		ctx.globalAlpha = alpha;
		ctx.fillStyle = glow;
		ctx.fillRect(0, center - COVER_GLOW_PX, W, COVER_GLOW_PX * 2);
		ctx.fillStyle = COVER_LINE_COLOR;
		ctx.fillRect(0, top, W, COVER_LINE_PX);
		ctx.globalAlpha = 1;
	}

	function drawGrain(): void {
		if (grain === null) return;
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
		ctx.fillStyle = grain;
		ctx.fillRect(0, 0, W, H);
	}

	function cancelPrewarm(): void {
		if (idleHandle !== 0 && typeof cancelIdleCallback === 'function')
			cancelIdleCallback(idleHandle);
		window.clearTimeout(timerHandle);
		idleHandle = 0;
		timerHandle = 0;
	}

	// 4장 레이어 · 스프라이트를 유휴 시간에 하나씩 만든다(requestIdleCallback, 없으면 setTimeout 으로 한 번에 하나)
	function schedulePrewarm(): void {
		const key = sizeKey();
		if (prewarmedFor === key) return;
		prewarmedFor = key;
		cancelPrewarm();
		const tasks = chapter4PrewarmTasks();
		const runIdle = (deadline: IdleDeadline): void => {
			idleHandle = 0;
			if (sizeKey() !== key) return;
			while (tasks.length > 0 && deadline.timeRemaining() > IDLE_MIN_MS) tasks.shift()?.();
			if (tasks.length > 0) idleHandle = requestIdleCallback(runIdle);
		};
		const runTimer = (): void => {
			timerHandle = 0;
			if (sizeKey() !== key) return;
			tasks.shift()?.();
			if (tasks.length > 0) timerHandle = window.setTimeout(runTimer, PREWARM_FALLBACK_MS);
		};
		if (typeof requestIdleCallback === 'function') idleHandle = requestIdleCallback(runIdle);
		else timerHandle = window.setTimeout(runTimer, PREWARM_FALLBACK_MS);
	}

	return {
		hasWebGl: wave !== null,
		resize(): void {
			// 스크롤바 폭을 뺀 실제 그림 폭(고정 캔버스의 100% 폭과 맞춘다)
			const width = document.documentElement.clientWidth;
			const height = window.innerHeight;
			const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
			canvas.width = Math.round(width * ratio);
			canvas.height = Math.round(height * ratio);
			setViewport(width, height, ratio);
			setGeometry(geometry());
			clearTextCache();
			clearRibbonCache();
			rebuildLayers();
			if (wave !== null) resizeWaveGl(wave);
		},
		render(state, t, still, marks, cover): void {
			setFrameMode(still, marks);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.globalCompositeOperation = 'source-over';
			ctx.globalAlpha = 1;
			if (cover !== null) {
				drawCover(cover, t, still);
			} else if (state.kind === 'beat') {
				const s = still ? state.index + STILL_P : state.s;
				drawSceneAt(state.chapter, s, still ? 0 : state.local, t, 1);
				if (state.chapter === PREWARM_CHAPTER && state.s >= PREWARM_FROM_S) schedulePrewarm();
			} else {
				const q = state.p;
				if (q < FADE_SPAN && state.prev !== 0) {
					const end = BEAT_COUNT_OF_CHAPTER.get(state.prev);
					drawSceneAt(
						state.prev,
						end === undefined ? 0 : end,
						still ? 0 : state.prevLocal,
						t,
						still ? 0 : 1 - q / FADE_SPAN
					);
				} else if (q > 1 - FADE_SPAN && state.next !== 0) {
					drawSceneAt(state.next, 0, 0, t, still ? 0 : (q - (1 - FADE_SPAN)) / FADE_SPAN);
				} else {
					setWaterVisible(false);
					ctx.fillStyle = '#000';
					ctx.fillRect(0, 0, W, H);
				}
			}
			drawGrain();
		},
		noteFrame(frameMs): void {
			if (wave !== null && waterVisible) noteWaveFrame(wave, frameMs);
		},
		dispose(): void {
			cancelPrewarm();
			bindWave(null);
		}
	};
}
