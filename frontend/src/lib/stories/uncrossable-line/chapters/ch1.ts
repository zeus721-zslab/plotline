// 1장 멈춘 두 빛(시제품 flow.src.html 장면 1 :1314-1519). 원자 하나에서 두 빛이 정반대로 날아가 창살 문 앞에서 멈추고, 붉은 선 75 가 그어진다.
// 5-5 · 5-6 · 8-4 는 이 장면을 겹쳐 그린다(overlay).
// 1-2 는 시그니처 장면이라 그림은 그대로 두고 문장 순번 대응만 옮겼다(STEP 125, v3.5 에서 옛 3·4번 문장이 새 3번으로 합쳐짐):
// 문 등장 · 설명 그림은 시제품과 같은 문장(1 · 2번)에 두고, 문장 경계를 넘는 값은 그 문장 길이 비율로 적는다(sentenceAt).
import {
	clamp01,
	COLOR_A,
	COLOR_B,
	ctx,
	drawBead,
	drawBlock,
	drawCrackedLaser,
	drawDust,
	drawGate,
	drawGlowText,
	drawLaser,
	drawLight,
	drawPass,
	drawRibbon,
	drawSprite,
	drawTank,
	easeInOut,
	easeOutCubic,
	G,
	glowSprite,
	H,
	lerp,
	MARKS,
	PALETTE_GOLD,
	PALETTE_RED,
	PASS_COLOR,
	BLOCK_COLOR,
	REDUCED,
	REDUCED_DEMO_PHASE,
	ringSprite,
	smooth,
	W,
	WARM,
	WHITE,
	type DustOptions,
	type Point
} from '../linePaint.ts';
import { bgInk, gateImages } from '../lineLayers.ts';
import { sentenceAt } from '../lineScene.ts';

const DEMO_PERIOD = 2.6; // 1-2 설명 그림 한 번(빛이 문에 닿고 결과가 나오기까지)의 길이(초)
const PAIR_PERIOD = 1.1; // 1-3 짝 결과 점멸 한 번의 길이(초)
const PAIR_RESULTS = [1, 0, 1, 1, 0, 1, 0, 0]; // 1 = 함께 지나감, 0 = 함께 막힘

// 1-2(장 안 비트 번호 1, s = 1 + p)의 문장 기준 임계값. [문장 번호(1부터), 문장 안 비율]은 시제품(v3.4 문장 구간) 값에서 옮겼다
const BEAT_1_2 = '1-2';
const BEAT_1_2_START = 1;
const at12 = (sentence: number, fraction: number): number =>
	BEAT_1_2_START + sentenceAt(BEAT_1_2, sentence, fraction);
// 문 등장: 1번 문장(문에 닿는다) 초반 ~ 2번 문장(창살처럼 결이 난 문) 후반. 시제품 p .02-.30
const GATE_IN: [number, number] = [at12(1, 0.099), at12(2, 0.731)];
// 설명 그림 켜짐: 1번 후반 ~ 2번 후반. 시제품 p .12-.30
const DEMO_IN: [number, number] = [at12(1, 0.593), at12(2, 0.731)];
// 설명 그림 꺼짐: 마지막 문장(빛의 답) 가운데 ~ 1-3 처음(시제품 p .94 ~ 1-3 의 .02)
const DEMO_OUT: [number, number] = [at12(5, 0.577), 2.02];
// 리본 무지개 · 맥박: 1-2 처음부터, 끝은 3번(떨림 · 결, 옛 3·4번 합침) 가운데 · 2번 앞쪽. 시제품 p 0-.5 · 0-.25
const RAINBOW_IN: [number, number] = [BEAT_1_2_START, at12(3, 0.488)];
const PULSE_IN: [number, number] = [BEAT_1_2_START, at12(2, 0.356)];

function driftOf(s: number): number {
	// 1-3 까지는 일정하게 흐르다 1-4 시작(s=3)에서 0.3 동안 감속해 그 자리에 멈춘다
	const flowing = 0.22 * Math.min(s, 3);
	const d = clamp01((s - 3) / 0.3) * 0.3;
	return flowing + 0.22 * (d - (d * d) / 0.6);
}

export function drawResultLamp(gate: Point, pass: boolean, I: number): void {
	if (I <= 0.003) return;
	const y = gate.y - gateImages.pair.r * 1.45 - 8; // 결 눈금 위
	const color = pass ? PASS_COLOR : BLOCK_COLOR;
	drawSprite(glowSprite(color), gate.x, y, 16, 0.7 * I);
	drawSprite(glowSprite(WHITE), gate.x, y, 3, I);
}

function drawGateDemo(s: number, t: number, posA: Point, posB: Point): void {
	// 1-2: 설명 그림. 왼쪽 빛은 지나가고 오른쪽 빛은 막힌다
	const demo = smooth(DEMO_IN[0], DEMO_IN[1], s) * (1 - smooth(DEMO_OUT[0], DEMO_OUT[1], s));
	if (demo > 0.003) {
		const phase = REDUCED ? REDUCED_DEMO_PHASE : (t % DEMO_PERIOD) / DEMO_PERIOD;
		if (phase < 0.4) {
			const k = easeInOut(phase / 0.4);
			drawBead(posA, G.gateA, k, demo, COLOR_A);
			drawBead(posB, G.gateB, k, demo, COLOR_B);
		} else {
			const k = (phase - 0.4) / 0.6;
			drawPass(posA, G.gateA, k, demo, COLOR_A);
			drawBlock(G.gateB, k, demo, 11);
		}
	}
	// 1-3: 같은 기울기의 두 문에서 결과가 짝지어 켜진다(함께 지나감 · 함께 막힘)
	const pairs = smooth(2.02, 2.14, s) * (1 - smooth(2.92, 3.0, s));
	if (pairs > 0.003) {
		const cycle = REDUCED ? 0 : Math.floor(t / PAIR_PERIOD);
		const phase = REDUCED ? REDUCED_DEMO_PHASE : (t % PAIR_PERIOD) / PAIR_PERIOD;
		const pass = PAIR_RESULTS[cycle % PAIR_RESULTS.length] === 1;
		if (phase < 0.35) {
			const k = easeInOut(phase / 0.35);
			drawBead(posA, G.gateA, k, pairs, COLOR_A);
			drawBead(posB, G.gateB, k, pairs, COLOR_B);
		} else {
			const k = (phase - 0.35) / 0.65;
			if (pass) {
				drawPass(posA, G.gateA, k, pairs, COLOR_A);
				drawPass(posB, G.gateB, k, pairs, COLOR_B);
			} else {
				drawBlock(G.gateA, k, pairs, 23 + cycle);
				drawBlock(G.gateB, k, pairs, 37 + cycle);
			}
			const lamp = pairs * (k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55);
			drawResultLamp(G.gateA, pass, lamp);
			drawResultLamp(G.gateB, pass, lamp);
		}
	}
}

/** 다른 장에서 1장 구도를 겹쳐 그릴 때: 세기 · 선 갈라짐 · 84 세기 · 물통 안을 WebGL 이 그리는지 */
export type Scene1Overlay = { alpha: number; crack: number; n84: number; tankInterior: boolean };

export function scene1(
	s: number,
	local: number,
	t: number,
	overlayOptions: Scene1Overlay | null
): void {
	const overlay = overlayOptions !== null;
	const alpha = overlayOptions !== null ? overlayOptions.alpha : 1;
	if (!overlay) {
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
		ctx.drawImage(bgInk, 0, 0, W, H);
	}
	ctx.globalCompositeOperation = 'lighter';
	const C = G.C;
	const atom = smooth(0.02, 0.14, s) * (1 - smooth(0.29, 0.33, s));
	const flash = smooth(0.27, 0.31, s) * (1 - smooth(0.31, 0.5, s));
	const flyRaw = clamp01((s - 0.3) / 0.62);
	const fly = easeOutCubic(flyRaw);
	const speed = s > 0.3 && s < 0.92 ? 3 * Math.pow(1 - flyRaw, 2) : 0;
	const posA = { x: lerp(C.x, G.A.x, fly), y: lerp(C.y, G.A.y, fly) };
	const posB = { x: lerp(C.x, G.B.x, fly), y: lerp(C.y, G.B.y, fly) };
	const lightsOn = smooth(0.29, 0.32, s);
	const rainbow = smooth(RAINBOW_IN[0], RAINBOW_IN[1], s);
	const stop = smooth(3.0, 3.2, s);
	const pulseAmount = 0.5 * smooth(PULSE_IN[0], PULSE_IN[1], s) * (1 - 0.65 * stop);
	const pulse = 1 + pulseAmount * Math.sin(t * 2.3);
	const tremble = 1 + 0.06 * stop * (1 - smooth(4.0, 4.2, s)) * Math.sin(t * 13 + 1.3);
	const lightI = lightsOn * pulse * tremble * alpha;
	const laserOn = (overlay ? 1 : smooth(4.03, 4.1, s)) * alpha;
	const laserTip = overlay ? 1.05 * W : lerp(-0.05 * W, 1.05 * W, clamp01((s - 4.06) / 0.58));
	const lights = [
		{ x: posA.x, y: posA.y, I: lightI * 0.9, R2: Math.pow(G.m * 0.2, 2) },
		{ x: posB.x, y: posB.y, I: lightI * 0.9, R2: Math.pow(G.m * 0.2, 2) },
		{ x: C.x, y: C.y, I: flash * 4 * alpha, R2: Math.pow(G.m * 0.6, 2) }
	];
	const dustOptions: DustOptions = {
		tint: 'warm',
		vis: smooth(0.29, 0.5, s) * alpha,
		drift: driftOf(s),
		scroll: local,
		lights,
		laser: laserOn > 0.003 ? { y: G.laserY, tip: laserTip, I: laserOn, w2: 22 * 22 } : null,
		glint: smooth(3.0, 3.3, s) * alpha,
		t,
		ambient: 0.13
	};
	drawDust(dustOptions, 0);
	drawDust(dustOptions, 1);
	if (flash > 0.003) {
		drawSprite(glowSprite(WARM), C.x, C.y, G.diag * 0.9, flash * 0.8);
		const ring = (s - 0.27) * G.diag * 3.4;
		const ringAlpha = (1 - smooth(0.3, 0.5, s)) * 0.22;
		drawSprite(ringSprite([255, 80, 60]), C.x, C.y, ring * 1.03, ringAlpha);
		drawSprite(ringSprite([120, 255, 160]), C.x, C.y, ring, ringAlpha);
		drawSprite(ringSprite([90, 120, 255]), C.x, C.y, ring * 0.97, ringAlpha);
	}
	if (atom > 0.003) {
		const amp = REDUCED ? 0 : 1.8 * smooth(0.1, 0.28, s);
		const jx = Math.sin(t * 37) * amp + Math.sin(t * 61) * amp * 0.5;
		const jy = Math.cos(t * 29) * amp + Math.cos(t * 53) * amp * 0.5;
		const flicker = 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 5.3);
		const grow = 1 + smooth(0.18, 0.3, s) * 1.5;
		drawSprite(glowSprite(WARM), C.x + jx, C.y + jy, G.m * 0.12 * grow, 0.35 * atom * flicker);
		drawSprite(glowSprite(WHITE), C.x + jx, C.y + jy, 4 * grow, atom * flicker);
	}
	// 리본 양 끝의 창살 문: 1-2 에서 서고, 1-4 부터는 한 발 물러나 희미해진다
	const gateOn = (overlay ? 0.45 : smooth(GATE_IN[0], GATE_IN[1], s) * (1 - 0.5 * stop)) * alpha;
	drawGate(G.gateA, gateImages.pair, gateOn);
	drawGate(G.gateB, gateImages.pair, gateOn);
	const tankOn = (overlay ? 1 : smooth(3.25, 3.7, s)) * alpha;
	if (tankOn > 0.003) {
		const interior = overlayOptions === null || !overlayOptions.tankInterior;
		drawTank(G.tankA, tankOn, t, interior);
		drawTank(G.tankB, tankOn, t, interior);
		ctx.globalCompositeOperation = 'lighter';
	}
	if (lightsOn > 0.003) {
		drawRibbon(C.x, C.y, posA.x, posA.y, lightI, COLOR_A, rainbow, 1);
		drawRibbon(C.x, C.y, posB.x, posB.y, lightI, COLOR_B, rainbow, 2);
		const angleA = Math.atan2(posA.y - C.y, posA.x - C.x);
		const angleB = Math.atan2(posB.y - C.y, posB.x - C.x);
		drawLight(posA.x, posA.y, lightI, COLOR_A, { angle: angleA, len: speed * G.m * 0.25 });
		drawLight(posB.x, posB.y, lightI, COLOR_B, { angle: angleB, len: speed * G.m * 0.25 });
		// 시간이 멈추는 순간(1-4) 두 빛에서 번지는 얇은 고리
		const freezeRing = smooth(3.0, 3.35, s);
		if (freezeRing > 0 && freezeRing < 1 && !overlay) {
			const ra = (1 - freezeRing) * 0.4;
			drawSprite(ringSprite([220, 235, 255]), posA.x, posA.y, freezeRing * G.m * 0.4, ra);
			drawSprite(ringSprite([220, 235, 255]), posB.x, posB.y, freezeRing * G.m * 0.4, ra);
		}
		if (!overlay) drawGateDemo(s, t, posA, posB);
	}
	if (laserOn > 0.003) {
		if (overlayOptions !== null && overlayOptions.crack > 0)
			drawCrackedLaser(G.laserY, laserOn, overlayOptions.crack);
		else drawLaser(G.laserY, laserTip, laserOn, null);
	}
	const a75 = (overlay ? 0.4 : smooth(4.62, 4.8, s)) * alpha;
	if (!MARKS.score75) drawGlowText('75', G.n75.x, G.n75.y, G.smallNum, PALETTE_RED, a75);
	if (overlayOptions !== null && overlayOptions.n84 > 0 && !MARKS.score84)
		drawGlowText('84', G.n84.x, G.n84.y, G.n84Size, PALETTE_GOLD, overlayOptions.n84);
	drawDust(dustOptions, 2);
}
