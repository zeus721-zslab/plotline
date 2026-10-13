// 사라진 세 자리 렌더러: Canvas 2D 한 장. 버퍼 크기는 캔버스 CSS 상자(getBoundingClientRect, D-47 D3) × 기기 배율(상한 2, 시제품 MAX_DPR).
// 그림은 트랙 위치(구간 · 진행값)와 시간(seconds, 정지 그림은 0)만으로 정해진다. 장 제목 구간은 앞 구간의 마지막 그림이 꺼져 간다.
import {
	S,
	resizeBloom,
	releaseBloom,
	setPaintState,
	withAlpha,
	type BigNumberPoint,
	type MarkPoint,
	type SceneFigures
} from './chaosPaint.ts';
import { entryOf, previousEntry, smoothstep, type TrackPosition } from './chaosScene.ts';
import type { TrackEntry } from './chapters.ts';
import type { ChaosWorld } from './chaosWorld.ts';
import { paint11, paint12, paint13 } from './scenes/ch1.ts';
import { paint21, paint22, paint23, paint24, paint25, paint26 } from './scenes/ch2.ts';
import { paint31, paint32, paint33, paint34, paint35 } from './scenes/ch3.ts';
import { paint41, paint45 } from './scenes/ch4.ts';
import { paint51, paint52, paint53, paint54 } from './scenes/ch5.ts';
import { paint61, paint62, paint63 } from './scenes/ch6.ts';
import { paint73, paint74, paint75 } from './scenes/ch7.ts';
import { paintCover, paintFinale } from './scenes/cover.ts';
import { drawSceneA, drawSceneB, drawSceneC, sceneScales } from './scenes/signature.ts';

const MAX_DPR = 2;

type Painter = (p: number, seconds: number, alive: boolean) => void;

// 시그니처 장면(A · B · C)을 쓰는 비트와 나머지 비트별 그림 함수(시제품 SCENE_OF_BEAT · PAINTERS)
const PAINTERS: ReadonlyMap<string, Painter> = new Map<string, Painter>([
	['1-1', paint11],
	['1-2', paint12],
	['1-3', paint13],
	['2-1', paint21],
	['2-2', paint22],
	['2-3', paint23],
	['2-4', paint24],
	['2-5', paint25],
	['2-6', paint26],
	['3-1', paint31],
	['3-2', paint32],
	['3-3', paint33],
	['3-4', paint34],
	['3-5', paint35],
	['4-1', paint41],
	['4-2', (p, seconds, alive) => drawSceneA('4-2', p, seconds, alive)],
	['4-3', (p, seconds, alive) => drawSceneA('4-3', p, seconds, alive)],
	['4-4', (p, seconds, alive) => drawSceneA('4-4', p, seconds, alive)],
	['4-5', paint45],
	['5-1', paint51],
	['5-2', paint52],
	['5-3', paint53],
	['5-4', paint54],
	['6-1', paint61],
	['6-2', paint62],
	['6-3', paint63],
	['6-4', drawSceneB],
	['7-1', (p) => drawSceneC('7-1', p)],
	['7-2', (p) => drawSceneC('7-2', p)],
	['7-3', paint73],
	['7-4', paint74],
	['7-5', paint75]
]);

/** 표식 DOM 의 자리(화면 CSS px). 렌더러가 캔버스 기준 기기 px 로 바꾼다 */
export type MarkMeasure = {
	centerX: number;
	centerY: number;
	characterWidth: number;
	keep: number;
};
export type BigNumberMeasure = { centerY: number; digitX: number[]; fallCss: number };
export type OverlayMeasure = {
	mark: () => MarkMeasure | null;
	bigNumber: () => BigNumberMeasure | null;
};

export type ChaosRenderer = {
	resize: () => void;
	render: (position: TrackPosition, seconds: number, alive: boolean) => void;
	dispose: () => void;
};

function drawEntry(entry: TrackEntry, p: number, seconds: number, alive: boolean): void {
	if (entry.kind === 'cover') {
		paintCover(p, seconds, alive);
		return;
	}
	if (entry.kind === 'finale') {
		paintFinale(p, seconds, alive);
		return;
	}
	if (entry.kind !== 'beat') return;
	const painter = PAINTERS.get(entry.beatId);
	if (painter !== undefined) painter(p, seconds, alive);
}

/** 2D 컨텍스트를 만들 수 없으면 예외(배경이 대체 화면을 보여 준다) */
export function createChaosRenderer(
	canvas: HTMLCanvasElement,
	world: ChaosWorld,
	figures: SceneFigures,
	measure: OverlayMeasure
): ChaosRenderer {
	const context = canvas.getContext('2d');
	if (context === null) throw new Error('2d context unavailable');
	let markCache: { width: number; height: number; point: MarkPoint } | null = null;
	let bigCache: { width: number; height: number; point: BigNumberPoint | null } | null = null;

	const markPoint = (): MarkPoint => {
		if (markCache !== null && markCache.width === S.width && markCache.height === S.height)
			return markCache.point;
		const rect = canvas.getBoundingClientRect();
		const found = measure.mark();
		const point: MarkPoint =
			found === null
				? { x: S.width / 2, y: S.height / 2, stillX: S.width / 2 }
				: {
						x: (found.centerX - rect.left) * S.dpr,
						y: (found.centerY - rect.top) * S.dpr,
						// 정지 그림에서 실이 나오는 자리: 가운데로 옮긴 찍힌 값의 오른쪽 끝 + 반 글자
						stillX:
							(found.centerX - rect.left) * S.dpr +
							(found.keep / 2 + 0.5) * found.characterWidth * S.dpr
					};
		markCache = { width: S.width, height: S.height, point };
		return point;
	};

	const bigNumberPoint = (): BigNumberPoint | null => {
		if (bigCache !== null && bigCache.width === S.width && bigCache.height === S.height)
			return bigCache.point;
		const rect = canvas.getBoundingClientRect();
		const found = measure.bigNumber();
		const point =
			found === null
				? null
				: {
						centerY: (found.centerY - rect.top) * S.dpr,
						digitX: found.digitX.map((x) => (x - rect.left) * S.dpr),
						fallPx: found.fallCss * S.dpr
					};
		bigCache = { width: S.width, height: S.height, point };
		return point;
	};

	setPaintState({
		context,
		width: 1,
		height: 1,
		dpr: 1,
		scales: { A: 1, B: 1, C: 1 },
		world,
		figures,
		markPoint,
		bigNumberPoint
	});

	return {
		resize: () => {
			const rect = canvas.getBoundingClientRect();
			S.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
			S.width = Math.max(1, Math.round(rect.width * S.dpr));
			S.height = Math.max(1, Math.round(rect.height * S.dpr));
			canvas.width = S.width;
			canvas.height = S.height;
			S.scales = sceneScales();
			resizeBloom();
			markCache = null;
			bigCache = null;
		},
		render: (position, seconds, alive) => {
			context.setTransform(1, 0, 0, 1, 0, 0);
			context.globalCompositeOperation = 'source-over';
			context.globalAlpha = 1;
			context.clearRect(0, 0, S.width, S.height);
			context.globalCompositeOperation = 'lighter';
			context.lineCap = 'butt';
			context.lineJoin = 'round';
			const entry = entryOf(position);
			if (entry.kind !== 'chapter') {
				drawEntry(entry, position.p, seconds, alive);
				return;
			}
			// 장 제목: 바로 앞 구간의 마지막 그림이 꺼져 간다(정지 모드는 빈 그림)
			if (!alive) return;
			const fade = 1 - smoothstep(0, 0.6, position.p);
			if (fade <= 0) return;
			withAlpha(fade, () => drawEntry(previousEntry(position.index), 1, seconds, alive));
		},
		dispose: () => {
			releaseBloom();
			canvas.width = 0;
			canvas.height = 0;
		}
	};
}
