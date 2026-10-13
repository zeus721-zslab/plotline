// 6장 아인슈타인 편이길 바란 사람(시제품 flow.src.html :4105-4557): 먼지 쌓인 서가 · 닫히는 복도 끝 문 · 기운 창살 문과 흔들리는 선 ·
// 엿보는 빛 · 제네바 연구실의 두 실루엣.
import {
	clamp01,
	COLOR_A,
	COLOR_B,
	ctx,
	dotSprite,
	dpr,
	drawBead,
	drawBeats,
	drawBlock,
	drawDust,
	drawGate,
	drawGlowText,
	drawLabel,
	drawLaser,
	drawLight,
	drawPass,
	drawSprite,
	drawTwinEdges,
	dustLayers,
	easeInOut,
	easeOutCubic,
	G,
	glowLine,
	glowSprite,
	H,
	hash,
	lerp,
	MARKS,
	PALETTE_RED,
	paintLayer,
	REDUCED,
	REDUCED_DEMO_PHASE,
	rgba,
	seeded,
	smooth,
	vignetteOn,
	W,
	WARM,
	WHITE,
	type DustOptions,
	type Point,
	type Rgb
} from '../linePaint.ts';
import { bgInk, gateImages, layer } from '../lineLayers.ts';
import { gamePositions, TILT_LEFT, TILT_RIGHT } from './ch5.ts';
import { GLANCE_PERIOD } from './ch7.ts';

const MILLISECONDS_PER_SECOND = 1000;

type Shelf = { rows: number[]; rowH: number; slot: { x: number; y: number; w: number; h: number } };
function shelfLayout(): Shelf {
	const rows = [0.06, 0.25, 0.44, 0.63].map((f) => f * H);
	const rowH = 0.19 * H;
	return {
		rows,
		rowH,
		slot: {
			x: (G.portrait ? 0.56 : 0.54) * W,
			y: rows[1] + rowH * 0.5,
			w: G.m * 0.022 + 3,
			h: rowH * 0.78
		}
	};
}
function shelfLayer(): HTMLCanvasElement {
	return layer('shelf', (g) => {
		const S = shelfLayout();
		g.fillStyle = '#0a0705';
		g.fillRect(0, 0, W, H);
		const warm = g.createRadialGradient(W * 0.3, -H * 0.1, 0, W * 0.3, -H * 0.1, G.diag);
		warm.addColorStop(0, 'rgba(120,80,45,0.4)');
		warm.addColorStop(1, 'rgba(0,0,0,0)');
		g.fillStyle = warm;
		g.fillRect(0, 0, W, H);
		const random = seeded(73);
		const tones: Rgb[] = [
			[92, 36, 30],
			[40, 62, 44],
			[70, 56, 36],
			[34, 44, 70],
			[86, 70, 46],
			[60, 30, 40]
		];
		for (const rowTop of S.rows) {
			const floorY = rowTop + S.rowH;
			g.fillStyle = 'rgba(0,0,0,0.6)';
			g.fillRect(0, rowTop, W, S.rowH);
			let x = 2;
			while (x < W) {
				const bw = (0.022 + random() * 0.03) * G.m * 1.2;
				const bh = S.rowH * (0.62 + random() * 0.3);
				const tone = tones[Math.floor(random() * tones.length)];
				const dim = 0.45 + random() * 0.35;
				const nearSlot = Math.abs(x - S.slot.x) < bw + S.slot.w && rowTop === S.rows[1];
				if (nearSlot) {
					x += S.slot.w + 6;
					continue;
				}
				const lean = random() < 0.06 ? (random() - 0.5) * 0.2 : 0;
				g.save();
				g.translate(x + bw / 2, floorY);
				g.rotate(lean);
				const spine = g.createLinearGradient(-bw / 2, 0, bw / 2, 0);
				spine.addColorStop(
					0,
					rgba(
						tone.map((v) => Math.round(v * dim * 0.6)),
						1
					)
				);
				spine.addColorStop(
					0.4,
					rgba(
						tone.map((v) => Math.round(v * dim)),
						1
					)
				);
				spine.addColorStop(
					1,
					rgba(
						tone.map((v) => Math.round(v * dim * 0.45)),
						1
					)
				);
				g.fillStyle = spine;
				g.fillRect(-bw / 2 + 1, -bh, bw - 2, bh);
				g.fillStyle = 'rgba(255,220,170,0.12)';
				g.fillRect(-bw / 2 + 1, -bh * 0.8, bw - 2, 1.5);
				g.fillRect(-bw / 2 + 1, -bh * 0.2, bw - 2, 1.5);
				// 책 위에 쌓인 먼지
				g.fillStyle = 'rgba(230,215,190,0.22)';
				g.fillRect(-bw / 2 + 1, -bh, bw - 2, 1.2);
				g.restore();
				x += bw;
			}
			const plank = g.createLinearGradient(0, floorY, 0, floorY + 0.018 * H);
			plank.addColorStop(0, '#3a2818');
			plank.addColorStop(1, '#120c07');
			g.fillStyle = plank;
			g.fillRect(0, floorY, W, 0.018 * H);
			g.fillStyle = 'rgba(255,214,170,0.3)';
			g.fillRect(0, floorY, W, 1);
		}
		vignetteOn(g, W * 0.5, H * 0.35, 0.75);
	});
}
function visit61(p: number, t: number, I: number): void {
	// 6-1: 먼지 쌓인 서가에서 논문 한 편이 빛나며 빠져나온다
	if (I <= 0.003) return;
	const S = shelfLayout();
	const slot = S.slot;
	const e = easeInOut(smooth(0.14, 0.78, p));
	const glow = smooth(0.04, 0.3, p);
	const pw = lerp(slot.w, G.m * 0.34, e);
	const ph = lerp(slot.h, G.m * 0.44, e);
	const cx = lerp(slot.x, W / 2, e);
	const cy = lerp(slot.y, (G.portrait ? 0.36 : 0.4) * H, e);
	ctx.globalCompositeOperation = 'lighter';
	drawSprite(
		glowSprite([255, 226, 180]),
		cx,
		cy,
		Math.max(pw, ph) * 1.4 + G.m * 0.1,
		(0.15 + 0.35 * glow) * I
	);
	ctx.globalCompositeOperation = 'source-over';
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(-0.12 * Math.sin(e * Math.PI));
	ctx.globalAlpha = Math.min(1, I);
	const paper = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
	paper.addColorStop(0, '#d8ccb6');
	paper.addColorStop(1, '#a89a82');
	ctx.fillStyle = paper;
	ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
	const text = smooth(0.55, 0.85, p);
	if (text > 0.003) {
		ctx.globalAlpha = Math.min(1, 0.6 * text * I);
		ctx.fillStyle = 'rgba(40,30,22,1)';
		ctx.fillRect(-pw * 0.3, -ph * 0.38, pw * 0.6, Math.max(2, ph * 0.025));
		for (let i = 0; i < 12; i++)
			ctx.fillRect(-pw * 0.38, -ph * 0.26 + i * ph * 0.055, pw * (0.62 + hash(i) * 0.14), 1);
	}
	ctx.restore();
	ctx.globalCompositeOperation = 'lighter';
	ctx.globalAlpha = Math.min(1, (0.3 + 0.5 * glow) * I);
	ctx.lineWidth = 1.2;
	ctx.strokeStyle = 'rgb(255,236,210)';
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(-0.12 * Math.sin(e * Math.PI));
	ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
	ctx.restore();
	// 빠져나올 때 일어나는 먼지
	const puff = smooth(0.14, 0.3, p) * (1 - smooth(0.4, 0.7, p));
	if (puff > 0.003) {
		const dot = dotSprite([255, 236, 210]);
		for (let i = 0; i < 40; i++) {
			const angle = hash(i * 3.7) * Math.PI * 2;
			const dist = G.m * 0.1 * hash(i * 1.9 + 1) * smooth(0.14, 0.6, p);
			drawSprite(
				dot,
				slot.x + Math.cos(angle) * dist,
				slot.y + Math.sin(angle) * dist * 0.6,
				1.5 + hash(i) * 2,
				puff * I
			);
		}
	}
}
type Corridor = {
	vp: Point;
	end: { x0: number; x1: number; y0: number; y1: number };
	door: { x: number; y: number; w: number; h: number };
};
function corridorGeometry(): Corridor {
	const vp = { x: W / 2, y: 0.38 * H };
	const ew = G.m * 0.26;
	const eh = G.m * 0.34;
	const dw = G.m * 0.11 + 6;
	const dh = dw * 2;
	const end = { x0: vp.x - ew / 2, x1: vp.x + ew / 2, y0: vp.y - eh * 0.45, y1: vp.y + eh * 0.55 };
	return { vp, end, door: { x: vp.x - dw / 2, y: end.y1 - dh, w: dw, h: dh } };
}
function corridorLayer(): HTMLCanvasElement {
	return layer('corridor', (g) => {
		const C = corridorGeometry();
		const e = C.end;
		const poly = (pts: number[], fill: string | CanvasGradient): void => {
			g.beginPath();
			g.moveTo(pts[0], pts[1]);
			for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
			g.closePath();
			g.fillStyle = fill;
			g.fill();
		};
		const wallL = g.createLinearGradient(0, 0, e.x0, 0);
		wallL.addColorStop(0, '#1a130d');
		wallL.addColorStop(1, '#0b0806');
		poly([0, 0, e.x0, e.y0, e.x0, e.y1, 0, H], wallL);
		const wallR = g.createLinearGradient(W, 0, e.x1, 0);
		wallR.addColorStop(0, '#1a130d');
		wallR.addColorStop(1, '#0b0806');
		poly([W, 0, e.x1, e.y0, e.x1, e.y1, W, H], wallR);
		const ceil = g.createLinearGradient(0, 0, 0, e.y0);
		ceil.addColorStop(0, '#120d09');
		ceil.addColorStop(1, '#080605');
		poly([0, 0, W, 0, e.x1, e.y0, e.x0, e.y0], ceil);
		const floor = g.createLinearGradient(0, e.y1, 0, H);
		floor.addColorStop(0, '#0a0806');
		floor.addColorStop(1, '#1c150f');
		poly([0, H, W, H, e.x1, e.y1, e.x0, e.y1], floor);
		poly([e.x0, e.y0, e.x1, e.y0, e.x1, e.y1, e.x0, e.y1], '#120d09');
		// 바닥 이음매(소실점으로 모인다)
		g.strokeStyle = 'rgba(255,214,170,0.05)';
		g.lineWidth = 1;
		for (let k = -6; k <= 6; k++) {
			g.beginPath();
			g.moveTo(C.vp.x + (k * (e.x1 - e.x0)) / 12, e.y1);
			g.lineTo(W / 2 + k * W * 0.2, H);
			g.stroke();
		}
		// 양쪽 벽의 문들(원근)
		for (const side of [-1, 1]) {
			for (let i = 0; i < 4; i++) {
				const f0 = 1 - 1 / (1 + (i + 0.3) * 0.9);
				const f1 = 1 - 1 / (1 + (i + 0.75) * 0.9);
				const xAt = (f: number): number => (side < 0 ? lerp(0, e.x0, f) : lerp(W, e.x1, f));
				const topAt = (f: number): number => lerp(0.12 * H, e.y0 + (e.y1 - e.y0) * 0.2, f);
				const botAt = (f: number): number => lerp(H, e.y1, f);
				poly(
					[xAt(f0), topAt(f0), xAt(f1), topAt(f1), xAt(f1), botAt(f1), xAt(f0), botAt(f0)],
					'rgba(5,4,3,0.85)'
				);
				g.strokeStyle = 'rgba(255,214,170,0.08)';
				g.beginPath();
				g.moveTo(xAt(f0), topAt(f0));
				g.lineTo(xAt(f1), topAt(f1));
				g.stroke();
			}
		}
		// 끝 문(닫힌 상태)과 문틀
		const d = C.door;
		g.fillStyle = '#0a0705';
		g.fillRect(d.x, d.y, d.w, d.h);
		g.strokeStyle = 'rgba(255,214,170,0.25)';
		g.lineWidth = 1;
		g.strokeRect(d.x - 2, d.y - 2, d.w + 4, d.h + 2);
		// 천장 등(꺼진 듯 희미)
		g.globalCompositeOperation = 'lighter';
		for (let i = 0; i < 4; i++) {
			const f = 1 - 1 / (1 + (i + 0.5) * 0.9);
			const y = lerp(0, e.y0, f);
			g.globalAlpha = 0.25 * (1 - f * 0.6);
			g.drawImage(
				glowSprite([255, 200, 140]),
				W / 2 - G.m * 0.12 * (1 - f),
				y - 6,
				G.m * 0.24 * (1 - f),
				12
			);
		}
		g.globalAlpha = 1;
		g.globalCompositeOperation = 'source-over';
		vignetteOn(g, W / 2, H * 0.4, 0.6);
	});
}
const SLAM_P = 0.56; // 6-2 문이 닫히는 진행값
const SLAM_SHAKE_MS = 240;
const SLAM_SHAKE_PX = 4;
// 6-2 문이 닫히는 순간을 정방향으로 지날 때 한 번 흔들린다(시간 구동). 다른 장에서 곧장 건너오면 흔들지 않는다(렌더러가 초기화)
let slamShakeStart = -1;
let lastSlamS = -1;
export function resetChapter6Shake(): void {
	lastSlamS = -1;
}
function visit62(p: number, t: number, I: number): void {
	// 6-2: 긴 복도 끝 문이 열려 빛이 쏟아지다가 쾅 닫히며 빛이 끊긴다
	if (I <= 0.003) return;
	const C = corridorGeometry();
	const d = C.door;
	const closing = smooth(SLAM_P, SLAM_P + 0.015, p);
	const open = smooth(0.06, 0.28, p) * (1 - closing);
	const pour = open * smooth(0.08, 0.4, p);
	ctx.globalCompositeOperation = 'source-over';
	if (open > 0.003) {
		ctx.globalAlpha = Math.min(1, I);
		const inside = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
		inside.addColorStop(0, 'rgb(255,236,206)');
		inside.addColorStop(1, 'rgb(255,214,160)');
		ctx.fillStyle = inside;
		ctx.fillRect(d.x + d.w * (1 - open), d.y, d.w * open, d.h);
		ctx.fillStyle = '#0a0705';
		ctx.fillRect(d.x, d.y, d.w * (1 - open) * 0.9, d.h);
	}
	ctx.globalCompositeOperation = 'lighter';
	if (pour > 0.003) {
		const grad = ctx.createLinearGradient(0, d.y + d.h, 0, H);
		grad.addColorStop(0, `rgba(255,220,170,${(0.5 * pour * I).toFixed(3)})`);
		grad.addColorStop(1, `rgba(255,220,170,${(0.08 * pour * I).toFixed(3)})`);
		ctx.globalAlpha = 1;
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.moveTo(d.x + d.w * (1 - open), d.y + d.h);
		ctx.lineTo(d.x + d.w, d.y + d.h);
		ctx.lineTo(W / 2 + G.m * 0.5, H);
		ctx.lineTo(W / 2 - G.m * 0.25, H);
		ctx.closePath();
		ctx.fill();
		drawSprite(
			glowSprite([255, 226, 180]),
			d.x + d.w / 2,
			d.y + d.h / 2,
			G.m * 0.6,
			0.45 * pour * I
		);
		drawSprite(
			glowSprite(WHITE),
			d.x + d.w * (1 - open * 0.5),
			d.y + d.h / 2,
			d.w * 0.6,
			0.5 * pour * I
		);
	}
	// 닫힌 뒤: 문 아래 틈의 가는 빛과 흩날리는 먼지
	const after = smooth(SLAM_P, SLAM_P + 0.02, p);
	if (after > 0.003) {
		const fade = after * (1 - smooth(SLAM_P + 0.05, 0.95, p) * 0.7);
		ctx.globalAlpha = Math.min(1, 0.6 * fade * I);
		ctx.drawImage(glowSprite([255, 220, 170]), d.x - d.w * 0.2, d.y + d.h - 2, d.w * 1.4, 4);
		const puff = clamp01((p - SLAM_P) / 0.25);
		const dot = dotSprite([255, 226, 190]);
		for (let i = 0; i < 36; i++) {
			const angle = -Math.PI * hash(i * 2.9);
			const dist = G.m * 0.12 * hash(i * 1.3 + 2) * easeOutCubic(puff);
			drawSprite(
				dot,
				d.x + d.w / 2 + Math.cos(angle) * dist * 1.6,
				d.y + d.h + Math.sin(angle) * dist * 0.5,
				1.4 + hash(i) * 1.6,
				(1 - puff) * I * 0.8
			);
		}
	}
}
const PAIR_DEMO_PERIOD = 1.3;
function drawPairDemo(
	source: Point,
	gates: [Point, Point],
	t: number,
	I: number,
	seed: number
): void {
	// 쌍둥이 빛이 하나씩 문으로 날아가 지나가거나 막힌다(시간 반복 · 설명용)
	if (I <= 0.003) return;
	const cycle = REDUCED ? 0 : Math.floor(t / PAIR_DEMO_PERIOD);
	const phase = REDUCED ? REDUCED_DEMO_PHASE : (t % PAIR_DEMO_PERIOD) / PAIR_DEMO_PERIOD;
	const passA = hash(cycle * 3.1 + seed) < 0.6;
	const passB = hash(cycle * 5.3 + seed) < (passA ? 0.7 : 0.35);
	drawSprite(glowSprite(WARM), source.x, source.y, G.m * 0.05, 0.6 * I);
	drawSprite(glowSprite(WHITE), source.x, source.y, 3, I);
	if (phase < 0.4) {
		const k = easeInOut(phase / 0.4);
		drawBead(source, gates[0], k, I, COLOR_A);
		drawBead(source, gates[1], k, I, COLOR_B);
		return;
	}
	const k = (phase - 0.4) / 0.6;
	if (passA) drawPass(source, gates[0], k, I, COLOR_A);
	else drawBlock(gates[0], k, I, 13 + cycle);
	if (passB) drawPass(source, gates[1], k, I, COLOR_B);
	else drawBlock(gates[1], k, I, 29 + cycle);
}
function visit63(p: number, t: number, I: number): void {
	// 6-3: 기운 원형 창살 문 두 개 · 쌍둥이 빛 · 점수가 붉은 선을 넘지만 선이 흔들려 점선이 된다
	if (I <= 0.003) return;
	const pos = gamePositions();
	const image = gateImages.upright;
	ctx.globalCompositeOperation = 'lighter';
	drawGate(pos.L, image, I, TILT_LEFT.R);
	drawGate(pos.R, image, I, TILT_RIGHT.B);
	drawPairDemo(pos.mid, [pos.L, pos.R], t, I * smooth(0.04, 0.14, p), 3);
	const lineY = pos.lineY;
	const wobble = smooth(0.6, 0.8, p);
	const dashed = smooth(0.66, 0.86, p);
	const bend =
		wobble > 0.003
			? (x: number): number =>
					wobble *
					G.m *
					0.018 *
					Math.sin(x * 0.035 + (REDUCED ? 1 : t * 5)) *
					Math.sin(x * 0.011 + 0.7)
			: null;
	if (dashed > 0.003) {
		ctx.save();
		ctx.setLineDash([lerp(40, 9, dashed), lerp(0, 11, dashed)]);
		drawLaser(lineY, 1.05 * W, I * (1 - 0.35 * dashed), bend);
		ctx.restore();
	} else {
		drawLaser(lineY, 1.05 * W, I, bend);
	}
	if (!MARKS.score75)
		drawGlowText(
			'75',
			W * (G.portrait ? 0.86 : 0.9),
			lineY - G.smallNum * 0.45,
			G.smallNum * 0.7,
			PALETTE_RED,
			0.75 * I
		);
	// 점수: 아래에서 올라와 선을 넘는다
	const rise = smooth(0.22, 0.52, p);
	const scoreI = smooth(0.18, 0.24, p) * I;
	if (scoreI > 0.003) {
		const y = lerp(lineY + 0.16 * H, lineY - 0.07 * H, easeInOut(rise));
		const labelSize = Math.max(11, G.m * 0.03);
		drawSprite(glowSprite([255, 200, 120]), W / 2, y, G.m * 0.12, 0.5 * scoreI);
		drawSprite(glowSprite(WHITE), W / 2, y, 5, scoreI);
		glowLine([W / 2 - G.m * 0.08, y, W / 2 + G.m * 0.08, y], 1.4, [255, 214, 150], 0.8 * scoreI);
		drawLabel(
			'점수',
			W / 2 + G.m * 0.08 + labelSize * 1.6,
			y,
			labelSize,
			'rgb(255,226,190)',
			0.8 * scoreI
		);
		const cross = Math.exp(-Math.abs(p - 0.42) / 0.025) * scoreI;
		if (cross > 0.01) drawSprite(glowSprite([255, 200, 160]), W / 2, lineY, G.m * 0.2, 0.6 * cross);
	}
}
function visit64(p: number, t: number, I: number): void {
	// 6-4: 출발 전부터 고정된 창살 문, 빛이 그 문 쪽을 힐끗 보는 듯한 잔상(엿봄)
	if (I <= 0.003) return;
	const y = (G.portrait ? 0.32 : 0.36) * H;
	const gate = { x: W * (G.portrait ? 0.7 : 0.66), y };
	const light = { x: W * (G.portrait ? 0.24 : 0.3), y };
	const image = gateImages.fixed;
	ctx.globalCompositeOperation = 'lighter';
	drawGate(gate, image, 0.8 * I);
	// 고정 핀: 문 고리 양옆에 박힌 빛 못
	for (const side of [-1, 1]) {
		const px = gate.x + side * image.r * 1.12;
		drawSprite(glowSprite([255, 214, 170]), px, gate.y, 9, 0.7 * I);
		drawSprite(glowSprite(WHITE), px, gate.y, 2.5, I);
	}
	const phase = REDUCED ? 0.3 : (t % GLANCE_PERIOD) / GLANCE_PERIOD;
	const look = Math.sin(clamp01(phase / 0.6) * Math.PI) * smooth(0.08, 0.25, p);
	const reach = (gate.x - light.x) * 0.3 * look;
	for (let i = 4; i >= 1; i--)
		drawSprite(
			glowSprite(COLOR_A),
			light.x + (reach * i) / 4,
			light.y,
			G.m * 0.06,
			0.24 * I * look * (1 - i * 0.15)
		);
	drawLight(light.x, light.y, 0.75 * I, COLOR_A, { angle: 0, len: reach * 1.2 });
}
function genevaLayer(): HTMLCanvasElement {
	return layer('geneva', (g) => {
		g.fillStyle = '#070504';
		g.fillRect(0, 0, W, H);
		const door = {
			x: W * (G.portrait ? 0.14 : 0.3),
			y: 0.08 * H,
			w: W * (G.portrait ? 0.72 : 0.4),
			h: 0.62 * H
		};
		// 문 안쪽 방
		const room = g.createRadialGradient(
			W / 2,
			door.y + door.h * 0.3,
			0,
			W / 2,
			door.y + door.h * 0.3,
			door.h * 0.9
		);
		room.addColorStop(0, '#5a3a20');
		room.addColorStop(0.5, '#2a1a0e');
		room.addColorStop(1, '#100a06');
		g.fillStyle = room;
		g.fillRect(door.x, door.y, door.w, door.h);
		// 뒷벽 칠판과 책장(흐림)
		g.save();
		g.filter = `blur(${(2.5 * G.sizeScale).toFixed(1)}px)`;
		g.fillStyle = 'rgba(14,30,24,0.9)';
		g.fillRect(door.x + door.w * 0.08, door.y + door.h * 0.12, door.w * 0.4, door.h * 0.22);
		g.fillStyle = 'rgba(30,20,12,0.9)';
		g.fillRect(door.x + door.w * 0.6, door.y + door.h * 0.08, door.w * 0.32, door.h * 0.45);
		g.restore();
		// 탁자
		const tableY = door.y + door.h * 0.68;
		g.fillStyle = '#140d07';
		g.fillRect(door.x + door.w * 0.18, tableY, door.w * 0.64, door.h * 0.04);
		g.fillStyle = 'rgba(255,200,140,0.35)';
		g.fillRect(door.x + door.w * 0.18, tableY, door.w * 0.64, 1);
		g.fillStyle = '#0a0705';
		g.fillRect(door.x + door.w * 0.24, tableY + door.h * 0.04, 4, door.h * 0.28);
		g.fillRect(door.x + door.w * 0.76, tableY + door.h * 0.04, 4, door.h * 0.28);
		// 마주 앉은 두 실루엣
		const person = (cx: number, dir: number): void => {
			const headR = door.h * 0.05;
			const headY = tableY - door.h * 0.2;
			g.fillStyle = '#060403';
			g.beginPath();
			g.arc(cx, headY, headR, 0, Math.PI * 2);
			g.fill();
			g.beginPath();
			g.moveTo(cx - headR * 1.7, tableY + door.h * 0.02);
			g.quadraticCurveTo(cx - headR * 1.9, headY + headR * 1.6, cx, headY + headR * 1.2);
			g.quadraticCurveTo(
				cx + headR * 1.9,
				headY + headR * 1.6,
				cx + headR * 1.7,
				tableY + door.h * 0.02
			);
			g.closePath();
			g.fill();
			// 팔이 탁자 위로
			g.fillRect(
				Math.min(cx, cx + dir * headR * 2.6),
				tableY - headR * 0.35,
				headR * 2.6,
				headR * 0.5
			);
			// 램프 쪽 가장자리 빛
			g.strokeStyle = 'rgba(255,190,120,0.55)';
			g.lineWidth = 1.2;
			g.beginPath();
			g.arc(
				cx,
				headY,
				headR,
				dir > 0 ? -Math.PI * 0.45 : Math.PI * 1.05,
				dir > 0 ? Math.PI * 0.1 : Math.PI * 1.55
			);
			g.stroke();
			// 등받이
			g.fillStyle = '#040302';
			g.fillRect(cx - dir * headR * 1.9 - 3, headY + headR, 6, door.h * 0.38);
		};
		person(door.x + door.w * 0.3, 1);
		person(door.x + door.w * 0.7, -1);
		// 문틀과 벽(가까운 층)
		g.fillStyle = '#0d0907';
		g.fillRect(0, 0, door.x, H);
		g.fillRect(door.x + door.w, 0, W - door.x - door.w, H);
		g.fillRect(0, 0, W, door.y);
		g.fillRect(0, door.y + door.h, W, H);
		g.strokeStyle = 'rgba(255,214,170,0.3)';
		g.lineWidth = 1.5;
		g.strokeRect(door.x, door.y, door.w, door.h);
		g.fillStyle = '#050403';
		g.fillRect(door.x - 0.03 * W, door.y - 0.01 * H, 0.03 * W, door.h + 0.01 * H);
		// 문 아래 바닥에 번진 빛
		g.globalCompositeOperation = 'lighter';
		const spill = g.createLinearGradient(0, door.y + door.h, 0, H);
		spill.addColorStop(0, 'rgba(255,190,120,0.18)');
		spill.addColorStop(1, 'rgba(255,190,120,0)');
		g.fillStyle = spill;
		g.beginPath();
		g.moveTo(door.x, door.y + door.h);
		g.lineTo(door.x + door.w, door.y + door.h);
		g.lineTo(door.x + door.w + 0.1 * W, H);
		g.lineTo(door.x - 0.1 * W, H);
		g.closePath();
		g.fill();
		g.globalCompositeOperation = 'source-over';
		vignetteOn(g, W / 2, H * 0.35, 0.55);
	});
}
function visit65(p: number, t: number, I: number): void {
	// 6-5: 제네바 연구실 문, 따뜻한 램프 아래 마주 앉은 두 실루엣
	if (I <= 0.003) return;
	const push = 1 + 0.05 * smooth(0, 1, p);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = Math.min(1, I);
	ctx.drawImage(
		genevaLayer(),
		W / 2 - (W * push) / 2,
		H * 0.35 - H * 0.35 * push,
		W * push,
		H * push
	);
	ctx.globalCompositeOperation = 'lighter';
	const lamp = { x: W / 2, y: 0.08 * H + 0.62 * H * 0.3 };
	const flicker = REDUCED ? 1 : 0.94 + 0.06 * Math.sin(t * 7.1) * Math.sin(t * 2.3);
	const warm = smooth(0, 0.4, p);
	ctx.globalAlpha = 1;
	ctx.fillStyle = '#080605';
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillRect(lamp.x - 0.75, 0.08 * H, 1.5, lamp.y - 0.08 * H - G.m * 0.02);
	ctx.globalCompositeOperation = 'lighter';
	drawSprite(
		glowSprite([255, 190, 110]),
		lamp.x,
		lamp.y,
		G.m * 0.7,
		(0.2 + 0.2 * warm) * flicker * I
	);
	drawSprite(glowSprite([255, 226, 180]), lamp.x, lamp.y, G.m * 0.08, 0.9 * flicker * I);
	drawSprite(glowSprite(WHITE), lamp.x, lamp.y, 4, flicker * I);
}
export function chapter6(s: number, local: number, t: number): void {
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	// 6-2 문이 닫히는 순간을 정방향으로 지날 때 한 번 흔들린다(시간 구동)
	const slamS = 1 + SLAM_P + 0.008;
	if (lastSlamS >= 0 && lastSlamS < slamS && s >= slamS && !REDUCED) slamShakeStart = t;
	lastSlamS = s;
	const shakeAge = (t - slamShakeStart) * MILLISECONDS_PER_SECOND;
	if (slamShakeStart >= 0 && shakeAge >= 0 && shakeAge < SLAM_SHAKE_MS && !REDUCED) {
		const amp = SLAM_SHAKE_PX * Math.exp(-shakeAge / (SLAM_SHAKE_MS * 0.35));
		ctx.translate(Math.sin(t * 90) * amp, Math.cos(t * 77) * amp);
	}
	const shelf = 1 - smooth(1, 1.1, s);
	const corridor = smooth(1, 1.1, s) * (1 - smooth(2, 2.1, s));
	const ink = smooth(2, 2.1, s) * (1 - smooth(4, 4.1, s));
	if (shelf > 0.003) paintLayer(shelfLayer(), shelf);
	if (corridor > 0.003) paintLayer(corridorLayer(), corridor);
	if (ink > 0.003) paintLayer(bgInk, ink);
	ctx.globalCompositeOperation = 'lighter';
	const slot = shelfLayout().slot;
	const dustOptions: DustOptions = {
		tint: s < 2 ? 'warm' : 'cool',
		vis: 0.8,
		drift: 0.15 * s,
		scroll: local,
		lights: [
			{ x: slot.x, y: slot.y, I: 0.8 * shelf, R2: Math.pow(G.m * 0.3, 2) },
			{ x: W / 2, y: 0.5 * H, I: 0.5 * corridor, R2: Math.pow(G.m * 0.4, 2) }
		],
		laser: null,
		glint: 0.3 * shelf,
		t,
		ambient: 0.1
	};
	dustLayers(dustOptions, 0, 1);
	drawBeats([visit61, visit62, visit63, visit64, visit65], s, t, local);
	drawTwinEdges(t, 0);
	drawDust(dustOptions, 2);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
