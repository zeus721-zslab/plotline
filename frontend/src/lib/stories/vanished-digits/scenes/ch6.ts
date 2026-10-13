// 6장 「갈매기에서 나비로」 시그니처 밖 비트(시제품 :2461-2605): 책에서 끌개가 올라와 점들이 갈매기로 모이고(6-1) ·
// 갈매기가 나비로 바뀌며 B B T T(6-2) · 나비 날개 끝에서 짝 계산 두 가닥이 출발(6-3). 6-4 는 시그니처 B(signature.ts).
import { mulberry32 } from '../chaosCompute.ts';
import {
	applyBloom,
	css,
	drawLabel,
	drawSprite,
	FONT_SERIF,
	GOLD,
	isWide,
	projectX,
	projectY,
	S,
	setFrame,
	stageBox,
	strokePoints,
	WHITE,
	withAlpha
} from '../chaosPaint.ts';
import { clamp01, KNOTS_FLOW, lerp, piecewise, rampP, smoothstep } from '../chaosScene.ts';
import { beatAt } from '../chapters.ts';
import { bookGeometry, drawBookScene } from './book.ts';
import { drawPair, viewB } from './signature.ts';

type Point = [number, number];
type Placement = { cx: number; cy: number; size: number };

const FORM_POINTS = 240;
const FORM_SEED = 1972; // 임의 고정값
const FORM_SCATTER: Point[] = (() => {
	const random = mulberry32(FORM_SEED);
	return Array.from({ length: FORM_POINTS }, (): Point => {
		const angle = random() * Math.PI * 2;
		const radius = 0.3 + random() * 0.7;
		return [Math.cos(angle) * radius, Math.sin(angle) * radius];
	});
})();

function bezier([a, b, c, d]: Point[], t: number): Point {
	const u = 1 - t;
	const at = (k: number): number =>
		u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k];
	return [at(0), at(1)];
}

/** 점 목록을 같은 길이 간격의 count 개로 다시 고른다(모양 사이 보간용) */
function resample(points: Point[], count: number): Point[] {
	const lengths = [0];
	for (let index = 1; index < points.length; index++)
		lengths.push(
			lengths[index - 1] +
				Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1])
		);
	const total = lengths[lengths.length - 1];
	const result: Point[] = [];
	let cursor = 1;
	for (let k = 0; k < count; k++) {
		const target = (total * k) / (count - 1);
		while (cursor < points.length - 1 && lengths[cursor] < target) cursor++;
		const span = Math.max(1e-9, lengths[cursor] - lengths[cursor - 1]);
		const t = clamp01((target - lengths[cursor - 1]) / span);
		result.push([
			lerp(points[cursor - 1][0], points[cursor][0], t),
			lerp(points[cursor - 1][1], points[cursor][1], t)
		]);
	}
	return result;
}

// 갈매기(손그림): 왼쪽 날개 끝 → 몸 → 오른쪽 날개 끝의 열린 선. 가로 −1~1, 세로는 위가 +
const GULL_DENSE_STEPS = 200;
const GULL_SHAPE: Point[] = (() => {
	const wings: Point[][] = [
		[
			[-1, 0.06],
			[-0.66, 0.44],
			[-0.24, 0.34],
			[-0.02, -0.04]
		],
		[
			[-0.02, -0.04],
			[0.22, 0.36],
			[0.62, 0.46],
			[0.97, 0.12]
		]
	];
	const dense: Point[] = [];
	for (const wing of wings)
		for (let k = 0; k <= GULL_DENSE_STEPS; k++) dense.push(bezier(wing, k / GULL_DENSE_STEPS));
	// 손으로 그은 듯한 작은 떨림(고정)
	return resample(dense, FORM_POINTS).map(([x, y], index): Point => [
		x + 0.008 * Math.sin(index * 1.7),
		y + 0.012 * Math.sin(index * 0.9 + 1.3)
	]);
})();

// 나비 날개 윤곽: 몸(세로축) 기준 각 θ(위 = 0)에서 r = 0.18 + 0.82·|sin 2θ|^0.9, 아래 날개는 0.72 배. 왼쪽 허리에서 시작해 한 바퀴 닫힌 선
const BUTTERFLY_DENSE_STEPS = 720;
const BUTTERFLY_SHAPE: Point[] = (() => {
	const dense: Point[] = [];
	for (let k = 0; k <= BUTTERFLY_DENSE_STEPS; k++) {
		const theta = -Math.PI / 2 + (k / BUTTERFLY_DENSE_STEPS) * Math.PI * 2;
		const lobe = Math.pow(Math.abs(Math.sin(2 * theta)), 0.9) * (Math.cos(theta) > 0 ? 1 : 0.72);
		const radius = 0.18 + 0.82 * lobe;
		dense.push([radius * Math.sin(theta), radius * Math.cos(theta)]);
	}
	return resample(dense, FORM_POINTS);
})();
// 오른쪽 위 날개 끝(6-3 두 가닥이 출발하는 자리)
const BUTTERFLY_TIP = BUTTERFLY_SHAPE.reduce(
	(best, point, index) =>
		point[0] + point[1] > BUTTERFLY_SHAPE[best][0] + BUTTERFLY_SHAPE[best][1] ? index : best,
	0
);

function gullPlacement(): Placement {
	const box = stageBox();
	return { cx: box.cx, cy: box.cy - box.height * 0.04, size: box.width * 0.44 };
}

function butterflyPlacement(): Placement {
	const box = stageBox();
	return {
		cx: box.cx,
		cy: box.cy - box.height * 0.02,
		size: Math.min(box.width, box.height) * 0.46
	};
}

function placePoint(shape: Point[], index: number, place: Placement): Point {
	return [place.cx + shape[index][0] * place.size, place.cy - shape[index][1] * place.size];
}

/** 점 목록(기기 px)을 손그림 선으로: 옅은 금빛 번짐 + 흰 심 */
function drawFormLine(points: number[], alpha: number): void {
	if (alpha <= 0) return;
	strokePoints(points, GOLD, 0.22 * alpha, 3);
	strokePoints(points, WHITE, 0.8 * alpha, 1.3);
}

function drawFormDots(points: number[], alpha: number): void {
	if (alpha <= 0) return;
	for (let index = 0; index < points.length; index += 2)
		drawSprite('dust', points[index], points[index + 1], 9, alpha);
}

export function paint61(p: number): void {
	const rise = rampP(p, beatAt('6-1', 0, 0.15), beatAt('6-1', 0, 0.9));
	const grow = rampP(p, beatAt('6-1', 1, 0), beatAt('6-1', 1, 0.8));
	const scatter = rampP(p, beatAt('6-1', 2, 0.1), beatAt('6-1', 3, 0.6));
	drawBookScene({
		brightness: lerp(0.1, 0.24, grow),
		shrink: 1 - grow,
		insert: 1 - rise,
		rest: 1 - rise,
		book: 1 - grow,
		fade: 1 - smoothstep(0, 0.35, scatter)
	});
	if (scatter > 0) {
		// 끌개 위 점들이 흩어졌다가 갈매기 선 위로 모인다
		const main = S.world.main;
		const mainSteps = main.length / 3 - 1;
		setFrame(bookGeometry().view, S.scales.A);
		const gull = gullPlacement();
		const bump = Math.sin(Math.PI * scatter) * css(70);
		const points: number[] = [];
		for (let k = 0; k < FORM_POINTS; k++) {
			const index = Math.round((k / (FORM_POINTS - 1)) * mainSteps);
			const [x, y] = placePoint(GULL_SHAPE, k, gull);
			points.push(
				lerp(projectX(main, index), x, scatter) + FORM_SCATTER[k][0] * bump,
				lerp(projectY(main, index), y, scatter) + FORM_SCATTER[k][1] * bump
			);
		}
		drawFormDots(points, smoothstep(0, 0.12, scatter) * (1 - 0.75 * smoothstep(0.8, 1, scatter)));
		drawFormLine(points, smoothstep(0.72, 1, scatter));
	}
	applyBloom(0.8);
}

const BBTT = ['B', 'B', 'T', 'T'];
export function paint62(p: number): void {
	const morph = rampP(p, beatAt('6-2', 0, 0.25), beatAt('6-2', 1, 0.7));
	const letters =
		rampP(p, beatAt('6-2', 3, 0), beatAt('6-2', 3, 0.25)) *
		(1 - rampP(p, beatAt('6-2', 3, 0.7), beatAt('6-2', 3, 1)));
	const gull = gullPlacement();
	const butterfly = butterflyPlacement();
	const points: number[] = [];
	for (let k = 0; k < FORM_POINTS; k++) {
		const [gx, gy] = placePoint(GULL_SHAPE, k, gull);
		const [bx, by] = placePoint(BUTTERFLY_SHAPE, k, butterfly);
		points.push(lerp(gx, bx, morph), lerp(gy, by, morph));
	}
	drawFormDots(points, 0.25 * (1 - morph));
	drawFormLine(points, 1);
	if (letters > 0) {
		const spacing = css(isWide() ? 64 : 46);
		const y = butterfly.cy + butterfly.size * 0.86 + (1 - letters) * css(10);
		BBTT.forEach((letter, k) =>
			drawLabel(
				letter,
				butterfly.cx + (k - 1.5) * spacing,
				y,
				isWide() ? 40 : 30,
				k < 2 ? GOLD : WHITE,
				letters,
				{ font: FONT_SERIF }
			)
		);
	}
	applyBloom(0.7);
}

export function paint63(p: number): void {
	withAlpha(1 - smoothstep(0.965, 1, p), () => drawPairDeparture(p));
}

/** 나비 날개 끝에서 금빛 · 흰빛 두 가닥(4-4 짝 계산)이 출발해 서로 다른 고리로 멀어진다. 시점은 6-4 첫 시점 */
function drawPairDeparture(p: number): void {
	const [first] = S.world.pair;
	setFrame(viewB(0), S.scales.B);
	const start = [projectX(first, 0), projectY(first, 0)];
	const move = rampP(p, beatAt('6-3', 1, 0), beatAt('6-3', 2, 0.6));
	const home = butterflyPlacement();
	const smallSize = home.size * 0.45;
	const tip = BUTTERFLY_SHAPE[BUTTERFLY_TIP];
	const place: Placement = {
		cx: lerp(home.cx, start[0] - tip[0] * smallSize, move),
		cy: lerp(home.cy, start[1] + tip[1] * smallSize, move),
		size: lerp(home.size, smallSize, move)
	};
	const appear = rampP(p, beatAt('6-3', 3, 0), beatAt('6-3', 3, 0.2));
	const outline: number[] = [];
	for (let k = 0; k < FORM_POINTS; k++) outline.push(...placePoint(BUTTERFLY_SHAPE, k, place));
	drawFormLine(outline, lerp(1, 0.4, appear));
	if (appear <= 0) {
		applyBloom(0.7);
		return;
	}
	drawPair(piecewise(KNOTS_FLOW.pair63, p), appear, KNOTS_FLOW.pair63, p);
}
