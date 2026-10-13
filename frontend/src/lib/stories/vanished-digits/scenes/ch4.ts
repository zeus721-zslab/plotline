// 4장 「나비 모양의 길」 시그니처 밖 비트(시제품 :2167-2215 · :2277-2287): 열두 가닥이 세 가닥으로 접히고 빛이 돌기 시작(4-1) ·
// 끌개가 종이 한 장이 되어 책 속으로(4-5). 4-2 · 4-3 · 4-4 는 시그니처 A(signature.ts).
import {
	addTrail,
	applyBloom,
	drawHeadGlow,
	drawSprite,
	flushTrails,
	GOLD,
	headPoint,
	MAIN_GROUP,
	mainLook,
	makeView,
	S,
	setFrame,
	stageBox,
	strokeFaded,
	WHITE,
	withAlpha,
	CENTER_Z
} from '../chaosPaint.ts';
import { lerp, piecewise, rampP, smoothstep } from '../chaosScene.ts';
import { beatAt } from '../chapters.ts';
import { drawBookScene } from './book.ts';
import { VIEW_A_PATH } from './signature.ts';

const STRAND_COUNT = 12;
const STRANDS_PER_GROUP = 4;
const STRAND_POINTS = 120;
const STRAND_SPAN_STEPS = 500;
const STRAND_OFFSETS = Array.from({ length: STRAND_COUNT }, (_, strand) => 400 + strand * 690); // 기준 궤적 걸음
// 세 변수를 대략 −1~1 로: x/20 · y/27 · (z−25)/22
const STRAND_SCALE = [20, 27, 22];
const VARIABLE_Z = 2;
// 4-1 끝에서 빛이 도는 끌개 크기(시그니처 A 배율 대비)
const LOOP_SCALE = 0.42;

function variableAt(variable: number, step: number): number {
	const main = S.world.main;
	const steps = main.length / 3 - 1;
	const wrapped = ((step % steps) + steps) % steps;
	const index = Math.floor(wrapped);
	const fraction = wrapped - index;
	const value = lerp(main[index * 3 + variable], main[(index + 1) * 3 + variable], fraction);
	return (variable === VARIABLE_Z ? value - CENTER_Z : value) / STRAND_SCALE[variable];
}

export function paint41(p: number, seconds: number, alive: boolean): void {
	withAlpha(1 - smoothstep(0.965, 1, p), () => drawStrands(p, seconds, alive));
}

function drawStrands(p: number, seconds: number, alive: boolean): void {
	const box = stageBox();
	const main = S.world.main;
	const fold = rampP(p, beatAt('4-1', 4, 0.1), beatAt('4-1', 4, 0.9));
	const loop = rampP(p, beatAt('4-1', 5, 0), beatAt('4-1', 5, 0.6));
	const appear = rampP(p, 0, beatAt('4-1', 0, 0.4));
	const shift = p * 420 + (alive ? seconds * 18 : 0);
	const laneGap = box.height / (STRAND_COUNT + 1);
	const edgeFade = (x: number): number =>
		smoothstep(box.left, box.left + box.width * 0.12, x) *
		(1 - smoothstep(box.right - box.width * 0.12, box.right, x));
	for (let strand = 0; strand < STRAND_COUNT; strand++) {
		// 네 가닥씩 접혀 한 가닥이 된다(위 · 가운데 · 아래)
		const group = Math.floor(strand / STRANDS_PER_GROUP);
		const lane = lerp(
			box.top + laneGap * (strand + 1),
			box.cy + (group - 1) * box.height * 0.2,
			fold
		);
		const amplitude = lerp(laneGap * 0.42, box.height * 0.07, fold);
		const points: number[] = [];
		for (let k = 0; k <= STRAND_POINTS; k++) {
			const s = k / STRAND_POINTS;
			const own = variableAt(strand % 3, STRAND_OFFSETS[strand] + s * STRAND_SPAN_STEPS + shift);
			const shared = variableAt(group, STRAND_OFFSETS[0] + s * STRAND_SPAN_STEPS + shift);
			points.push(lerp(box.left, box.right, s), lane - lerp(own, shared, fold) * amplitude);
		}
		strokeFaded(points, group === 1 ? WHITE : GOLD, 0.5 * appear * (1 - 0.55 * loop), 1, edgeFade);
	}
	if (loop <= 0) {
		applyBloom(0.7);
		return;
	}
	// 세 줄 안에서 빛이 둥글게 돌기 시작한다(기준 궤적 첫 바퀴, 4-2 시점의 첫 각도)
	setFrame(makeView(VIEW_A_PATH.yaw[0], VIEW_A_PATH.pitch[0]), S.scales.A * LOOP_SCALE);
	const head = piecewise(
		[
			[beatAt('4-1', 5, 0), 0],
			[beatAt('4-1', 6, 0.95), 420]
		],
		p
	);
	addTrail(main, 0, head, MAIN_GROUP, mainLook(0.2 * loop, 0.95 * loop, 0, seconds));
	flushTrails();
	drawHeadGlow(main, head, 40, WHITE, loop);
	applyBloom(0.8);
	const [x, y] = headPoint(main, head);
	drawSprite('white', x, y, 48, loop);
}

export function paint45(p: number): void {
	drawBookScene({
		brightness: lerp(0.1, 0.22, rampP(p, 0, beatAt('4-5', 0, 0.6))),
		shrink: rampP(p, beatAt('4-5', 1, 0.05), beatAt('4-5', 1, 0.9)),
		book: rampP(p, beatAt('4-5', 1, 0.5), beatAt('4-5', 2, 0.15)),
		insert: rampP(p, beatAt('4-5', 2, 0.1), beatAt('4-5', 2, 0.85)),
		rest: rampP(p, beatAt('4-5', 3, 0.1), beatAt('4-5', 3, 0.9)),
		fade: 1
	});
	applyBloom(0.8);
}
