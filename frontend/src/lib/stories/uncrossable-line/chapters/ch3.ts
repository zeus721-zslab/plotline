// 3장 아침의 질문, 저녁의 반박(시제품 flow.src.html :2836-3172): 솔베이 회의 식탁. 시간대에 따라 창밖과 빛 온도가 바뀐다.
// 3-3 은 v3.5 에서 4번 문장("높이가 흐릿하면, 시계가 가리키는 순간도 흐릿해진다.")이 새로 들어와, 그림을 문장 기준 진행값으로 옮겼다(STEP 125):
// 창밖 밝아짐 = 1번(다음 날 아침)에서 시작 · 상자 흔들림 = 2번(높이가 흐릿해진다)까지 · 시계 바늘 휨과 둘레 일렁임 = 새 4번.
import {
	ctx,
	dotSprite,
	drawBeats,
	drawDust,
	drawSprite,
	drawTwinEdges,
	dustLayers,
	circlePoints,
	G,
	glowLine,
	glowSprite,
	H,
	lerp,
	paintLayer,
	REDUCED,
	rgba,
	ringSprite,
	roundRectPath,
	seeded,
	smooth,
	strokePoly,
	vignetteOn,
	W,
	WHITE,
	type DustOptions,
	type Point,
	type Rect,
	type Rgb
} from '../linePaint.ts';
import { layer } from '../lineLayers.ts';
import { sentenceAt } from '../lineScene.ts';

// 3-3(장 안 비트 번호 2, s = 2 + p)의 문장 기준 임계값. [문장 번호(1부터), 문장 안 비율]
const BEAT_3_3 = '3-3';
const BEAT_3_3_START = 2;
// 창밖 밝아짐: 1번 끝무렵 ~ 5번(옛 4번, 결국 순간과 에너지는) 후반. 시제품 s 2.1-2.55
const DAWN_IN: [number, number] = [
	BEAT_3_3_START + sentenceAt(BEAT_3_3, 1, 0.838),
	BEAT_3_3_START + sentenceAt(BEAT_3_3, 5, 0.693)
];
// 상자 흔들림 세기: 1번 가운데 ~ 2번 끝무렵. 시제품 p .05-.25
const SHAKE_IN: [number, number] = [sentenceAt(BEAT_3_3, 1, 0.419), sentenceAt(BEAT_3_3, 2, 0.931)];
// 시계 바늘 휨: 새 4번 문장 동안. 둘레 일렁임은 시제품처럼 휨보다 조금(휨 구간의 1/8) 늦게 시작한다
const BEND_IN: [number, number] = [sentenceAt(BEAT_3_3, 4, 0), sentenceAt(BEAT_3_3, 4, 1)];
const WARP_IN: [number, number] = [sentenceAt(BEAT_3_3, 4, 0.125), sentenceAt(BEAT_3_3, 4, 1)];

type Arch = Rect;
type DiningLayout = { windows: Arch[]; tableY: number; tableFront: number; x0: number; x1: number };
function diningLayout(): DiningLayout {
	const portrait = G.portrait;
	return {
		windows: (portrait ? [0.2, 0.5, 0.8] : [0.26, 0.5, 0.74]).map((fx) => ({
			x: fx * W,
			y: 0.07 * H,
			w: (portrait ? 0.18 : 0.1) * W,
			h: (portrait ? 0.26 : 0.32) * H
		})),
		tableY: (portrait ? 0.5 : 0.54) * H,
		tableFront: (portrait ? 0.6 : 0.66) * H,
		x0: (portrait ? 0.16 : 0.2) * W,
		x1: (portrait ? 0.84 : 0.8) * W
	};
}
function windowPath(g: CanvasRenderingContext2D, win: Arch): void {
	const r = win.w / 2;
	g.beginPath();
	g.moveTo(win.x - r, win.y + win.h);
	g.lineTo(win.x - r, win.y + r);
	g.arc(win.x, win.y + r, r, Math.PI, 0);
	g.lineTo(win.x + r, win.y + win.h);
	g.closePath();
}
function diningLayer(): HTMLCanvasElement {
	return layer('dining', (g) => {
		const L = diningLayout();
		const wall = g.createLinearGradient(0, 0, 0, H);
		wall.addColorStop(0, '#17110c');
		wall.addColorStop(0.5, '#110c08');
		wall.addColorStop(1, '#070504');
		g.fillStyle = wall;
		g.fillRect(0, 0, W, H);
		g.fillStyle = 'rgba(0,0,0,0.35)';
		g.fillRect(0, L.tableY - 0.07 * H, W, 0.006 * H);
		// 창: 구멍을 뚫어, 뒤에 그리는 하늘이 보이게 한다
		g.globalCompositeOperation = 'destination-out';
		for (const win of L.windows) {
			windowPath(g, win);
			g.fill();
		}
		g.globalCompositeOperation = 'source-over';
		for (const win of L.windows) {
			g.fillStyle = 'rgba(10,7,5,0.96)';
			g.fillRect(win.x - 1.5, win.y, 3, win.h);
			for (const f of [0.45, 0.72])
				g.fillRect(win.x - win.w / 2, win.y + win.h * f - 1.5, win.w, 3);
			windowPath(g, win);
			g.lineWidth = 5;
			g.strokeStyle = '#0c0806';
			g.stroke();
			g.lineWidth = 1;
			g.strokeStyle = 'rgba(255,220,180,0.18)';
			g.stroke();
			g.fillStyle = 'rgba(255,214,170,0.14)';
			g.fillRect(win.x - win.w / 2 - 4, win.y + win.h + 2, win.w + 8, 2);
		}
		// 식탁: 흰 식탁보를 덮은 긴 상판(앞이 넓은 사다리꼴)
		const inset = (L.x1 - L.x0) * 0.04;
		g.beginPath();
		g.moveTo(L.x0 + inset, L.tableY);
		g.lineTo(L.x1 - inset, L.tableY);
		g.lineTo(L.x1, L.tableFront);
		g.lineTo(L.x0, L.tableFront);
		g.closePath();
		const cloth = g.createLinearGradient(0, L.tableY, 0, L.tableFront);
		cloth.addColorStop(0, '#3a332c');
		cloth.addColorStop(1, '#4b433a');
		g.fillStyle = cloth;
		g.fill();
		const drop = 0.07 * H;
		const skirt = g.createLinearGradient(0, L.tableFront, 0, L.tableFront + drop);
		skirt.addColorStop(0, '#2e2822');
		skirt.addColorStop(1, '#14110e');
		g.fillStyle = skirt;
		g.fillRect(L.x0, L.tableFront, L.x1 - L.x0, drop);
		g.fillStyle = 'rgba(0,0,0,0.25)';
		for (let x = L.x0 + 10; x < L.x1; x += G.m * 0.05) g.fillRect(x, L.tableFront + 2, 2, drop - 2);
		g.fillStyle = '#060504';
		for (const lx of [L.x0 + 0.03 * W, L.x1 - 0.03 * W])
			g.fillRect(lx - 3, L.tableFront + drop, 6, H);
		g.fillStyle = 'rgba(255,226,190,0.28)';
		g.fillRect(L.x0, L.tableFront, L.x1 - L.x0, 1);
		// 마주 놓인 두 의자: 높은 등받이가 바깥, 좌판이 식탁 쪽
		const chair = (backX: number, dir: number): void => {
			const cw = G.m * 0.12;
			const backH = 0.25 * H;
			const seatY = L.tableFront + 0.01 * H;
			g.fillStyle = '#0a0705';
			roundRectPath(g, backX - cw * 0.09, seatY - backH, cw * 0.18, backH, cw * 0.06);
			g.fill();
			g.fillRect(Math.min(backX, backX + dir * cw), seatY - cw * 0.08, cw, cw * 0.16);
			g.fillRect(backX - 2, seatY, 4, 0.13 * H);
			g.fillRect(backX + dir * cw - 2, seatY, 4, 0.13 * H);
			g.fillStyle = 'rgba(255,214,170,0.35)';
			g.fillRect(backX + dir * cw * 0.09, seatY - backH + cw * 0.06, 1, backH - cw * 0.1);
			g.fillRect(Math.min(backX, backX + dir * cw), seatY - cw * 0.08, cw, 1);
		};
		chair(L.x0 - 0.05 * W, 1);
		chair(L.x1 + 0.05 * W, -1);
		const fl = g.createLinearGradient(0, L.tableFront + drop, 0, H);
		fl.addColorStop(0, 'rgba(40,30,22,0.5)');
		fl.addColorStop(1, 'rgba(0,0,0,0)');
		g.fillStyle = fl;
		g.fillRect(0, L.tableFront + drop, W, H);
		vignetteOn(g, W / 2, H * 0.4, 0.55);
	});
}
const STARS = (() => {
	const random = seeded(61);
	const n = 90;
	const s = {
		u: new Float32Array(n),
		v: new Float32Array(n),
		b: new Float32Array(n),
		f: new Float32Array(n)
	};
	for (let i = 0; i < n; i++) {
		s.u[i] = random();
		s.v[i] = random();
		s.b[i] = random();
		s.f[i] = 1 + random() * 3;
	}
	return s;
})();
const SKY_MORNING: Rgb[] = [
	[150, 178, 215],
	[255, 226, 175]
];
const SKY_NIGHT: Rgb[] = [
	[4, 7, 20],
	[18, 26, 58]
];
const SKY_DAWN: Rgb[] = [
	[44, 42, 92],
	[255, 150, 110]
];
const SHAFT_COLOR = { morning: [255, 214, 150], night: [140, 170, 255], dawn: [255, 170, 140] };
const SHAFT_POWER = { morning: 0.22, night: 0.05, dawn: 0.13 };
type DayWeights = { morning: number; night: number; dawn: number };
function dayWeights(s: number): DayWeights {
	const toNight = smooth(1.08, 1.6, s);
	const toDawn = smooth(DAWN_IN[0], DAWN_IN[1], s);
	return { morning: 1 - toNight, night: toNight * (1 - toDawn), dawn: toDawn };
}
const blend3 = (w: DayWeights, a: Rgb, b: Rgb, c: Rgb): Rgb =>
	[0, 1, 2].map((i) => Math.round(a[i] * w.morning + b[i] * w.night + c[i] * w.dawn));
function drawSky(L: DiningLayout, w: DayWeights, t: number): void {
	const top = blend3(w, SKY_MORNING[0], SKY_NIGHT[0], SKY_DAWN[0]);
	const bottom = blend3(w, SKY_MORNING[1], SKY_NIGHT[1], SKY_DAWN[1]);
	ctx.globalCompositeOperation = 'source-over';
	for (const [wi, win] of L.windows.entries()) {
		ctx.save();
		windowPath(ctx, win);
		ctx.clip();
		const sky = ctx.createLinearGradient(0, win.y, 0, win.y + win.h);
		sky.addColorStop(0, rgba(top, 1));
		sky.addColorStop(1, rgba(bottom, 1));
		ctx.globalAlpha = 1;
		ctx.fillStyle = sky;
		ctx.fillRect(win.x - win.w / 2, win.y, win.w, win.h);
		const starI = w.night + 0.25 * w.dawn;
		if (starI > 0.01) {
			ctx.globalCompositeOperation = 'lighter';
			const dot = dotSprite([230, 236, 255]);
			for (let i = wi; i < STARS.u.length; i += L.windows.length) {
				const twinkle = REDUCED ? 0.8 : 0.6 + 0.4 * Math.sin(t * STARS.f[i] + i);
				drawSprite(
					dot,
					win.x - win.w / 2 + STARS.u[i] * win.w,
					win.y + STARS.v[i] * win.h * 0.85,
					1 + STARS.b[i] * 1.6,
					starI * twinkle * (0.4 + 0.6 * STARS.b[i])
				);
			}
			ctx.globalCompositeOperation = 'source-over';
		}
		ctx.restore();
	}
}
function drawDiningShafts(
	L: DiningLayout,
	w: DayWeights
): { color: Rgb; power: number; shift: number } {
	const color = blend3(w, SHAFT_COLOR.morning, SHAFT_COLOR.night, SHAFT_COLOR.dawn);
	const power =
		SHAFT_POWER.morning * w.morning + SHAFT_POWER.night * w.night + SHAFT_POWER.dawn * w.dawn;
	const shift = (G.portrait ? 0.12 : 0.16) * W;
	ctx.globalCompositeOperation = 'lighter';
	for (const win of L.windows) {
		const x0 = win.x - win.w / 2;
		const x1 = win.x + win.w / 2;
		const yTop = win.y + win.h * 0.3;
		const yBot = L.tableFront;
		const grad = ctx.createLinearGradient(0, yTop, 0, yBot);
		grad.addColorStop(0, rgba(color, power));
		grad.addColorStop(1, rgba(color, power * 0.25));
		ctx.globalAlpha = 1;
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.moveTo(x0, yTop);
		ctx.lineTo(x1, yTop);
		ctx.lineTo(x1 + shift + win.w * 0.3, yBot);
		ctx.lineTo(x0 + shift - win.w * 0.1, yBot);
		ctx.closePath();
		ctx.fill();
		ctx.save();
		ctx.translate(win.x + shift, lerp(L.tableY, L.tableFront, 0.55));
		ctx.scale(1, 0.25);
		drawSprite(glowSprite(color), 0, 0, win.w * 1.5, power * 2.4);
		ctx.restore();
	}
	return { color, power, shift };
}
// 시계 달린 상자: 정면 + 윗면 + 오른쪽 옆면. 정면에 빛나는 시계, 옆면에 작은 문
function drawClockBox(
	cx: number,
	baseY: number,
	b: number,
	I: number,
	open: number,
	t: number,
	bend: number
): Point | null {
	if (I <= 0.003) return null;
	const dx = b * 0.32;
	const dy = b * 0.22;
	const x0 = cx - b / 2;
	const y0 = baseY - b;
	const quad = (pts: number[]): void => {
		ctx.beginPath();
		ctx.moveTo(pts[0], pts[1]);
		for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
		ctx.closePath();
	};
	const topFace = [x0, y0, x0 + b, y0, x0 + b + dx, y0 - dy, x0 + dx, y0 - dy];
	const sideFace = [x0 + b, y0, x0 + b + dx, y0 - dy, x0 + b + dx, baseY - dy, x0 + b, baseY];
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = Math.min(1, I);
	const front = ctx.createLinearGradient(x0, y0, x0 + b, baseY);
	front.addColorStop(0, '#2c2017');
	front.addColorStop(1, '#0d0907');
	ctx.fillStyle = front;
	ctx.fillRect(x0, y0, b, b);
	quad(topFace);
	ctx.fillStyle = '#20180f';
	ctx.fill();
	quad(sideFace);
	ctx.fillStyle = '#0a0705';
	ctx.fill();
	ctx.globalCompositeOperation = 'lighter';
	glowLine([x0, y0, x0 + b, y0, x0 + b, baseY, x0, baseY, x0, y0], 0.9, [255, 200, 140], 0.55 * I);
	glowLine(
		[x0, y0, x0 + dx, y0 - dy, x0 + b + dx, y0 - dy, x0 + b + dx, baseY - dy, x0 + b, baseY],
		0.8,
		[255, 200, 140],
		0.35 * I
	);
	// 시계
	const cr = b * 0.3;
	const ccx = cx;
	const ccy = y0 + b * 0.47;
	drawSprite(glowSprite([255, 220, 170]), ccx, ccy, cr * 2.4, 0.35 * I);
	ctx.globalAlpha = Math.min(1, 0.22 * I);
	ctx.fillStyle = 'rgb(255,226,190)';
	ctx.beginPath();
	ctx.arc(ccx, ccy, cr, 0, Math.PI * 2);
	ctx.fill();
	glowLine(circlePoints(ccx, ccy, cr, 40), 0.9, [255, 226, 190], 0.7 * I);
	for (let k = 0; k < 12; k++) {
		const a = (k / 12) * Math.PI * 2;
		strokePoly(
			[
				ccx + Math.cos(a) * cr * 0.8,
				ccy + Math.sin(a) * cr * 0.8,
				ccx + Math.cos(a) * cr * 0.92,
				ccy + Math.sin(a) * cr * 0.92
			],
			1,
			'rgb(255,236,210)',
			0.7 * I
		);
	}
	const hand = (angle: number, length: number, width: number): void => {
		const ex = ccx + Math.cos(angle) * length;
		const ey = ccy + Math.sin(angle) * length;
		// 휘어진 바늘: 가운데를 바늘에 수직으로 민다
		const mx = (ccx + ex) / 2 - Math.sin(angle) * bend * length * 0.45;
		const my = (ccy + ey) / 2 + Math.cos(angle) * bend * length * 0.45;
		const pts: number[] = [];
		for (let i = 0; i <= 10; i++) {
			const u = i / 10;
			pts.push(
				(1 - u) * (1 - u) * ccx + 2 * (1 - u) * u * mx + u * u * ex,
				(1 - u) * (1 - u) * ccy + 2 * (1 - u) * u * my + u * u * ey
			);
		}
		glowLine(pts, width, [255, 240, 220], 0.9 * I);
	};
	hand(-Math.PI / 2 + t * 0.5, cr * 0.82, 1);
	hand(-Math.PI / 2 + 2.1 + t * 0.04, cr * 0.55, 1.5);
	// 옆면의 작은 문
	const door = { x: x0 + b + dx * 0.5, y: lerp(y0, baseY, 0.62) - dy * 0.5 };
	if (open > 0.003) {
		drawSprite(glowSprite([255, 236, 200]), door.x, door.y, b * 0.4, 0.6 * open * I);
		drawSprite(glowSprite(WHITE), door.x, door.y, 3, open * I);
	}
	const leafW = dx * 0.5 * (1 - open);
	glowLine(
		[
			door.x - dx * 0.25,
			door.y - b * 0.12,
			door.x - dx * 0.25 + leafW,
			door.y - b * 0.12 - dy * 0.25 * (1 - open),
			door.x - dx * 0.25 + leafW,
			door.y + b * 0.08 - dy * 0.25 * (1 - open),
			door.x - dx * 0.25,
			door.y + b * 0.08
		],
		0.8,
		[255, 214, 170],
		0.5 * I
	);
	return door;
}
function dining31(p: number, t: number, I: number): void {
	// 3-1: 긴 식탁 · 마주 놓인 두 의자 · 아침 햇살. 의자 등받이에 햇살이 닿는다
	const L = diningLayout();
	ctx.globalCompositeOperation = 'lighter';
	for (const x of [L.x0 - 0.05 * W, L.x1 + 0.05 * W])
		drawSprite(
			glowSprite([255, 214, 160]),
			x,
			L.tableFront - 0.12 * H,
			G.m * 0.12,
			0.12 * I * smooth(0, 0.4, p)
		);
}
function boxSize(): number {
	return G.m * 0.16 + 12;
}
function dining32(p: number, t: number, I: number): void {
	// 3-2: 시계 달린 상자, 작은 문이 열리며 빛 한 알이 빠져나간다
	const L = diningLayout();
	const b = boxSize();
	const baseY = lerp(L.tableY, L.tableFront, 0.6);
	const appear = smooth(0, 0.15, p) * I;
	const open = smooth(0.35, 0.5, p);
	const door = drawClockBox(
		W / 2,
		baseY + (1 - smooth(0, 0.15, p)) * 0.02 * H,
		b,
		appear,
		open,
		t,
		0
	);
	if (door === null) return;
	const fly = smooth(0.48, 0.85, p);
	if (fly > 0.003 && fly < 0.999) {
		const target = L.windows[2];
		const tx = target.x;
		const ty = target.y + target.h * 0.4;
		const x = lerp(door.x, tx, fly);
		const y = lerp(door.y, ty, fly) - Math.sin(fly * Math.PI) * 0.08 * H;
		const pts: number[] = [];
		for (let i = 0; i <= 12; i++) {
			const u = Math.max(0, fly - 0.15 + (0.15 * i) / 12);
			pts.push(lerp(door.x, tx, u), lerp(door.y, ty, u) - Math.sin(u * Math.PI) * 0.08 * H);
		}
		const trail = ctx.createLinearGradient(pts[0], pts[1], x, y);
		trail.addColorStop(0, 'rgba(255,236,200,0)');
		trail.addColorStop(1, 'rgba(255,236,200,1)');
		ctx.lineCap = 'round';
		strokePoly(pts, 2, trail, 0.8 * I);
		drawSprite(glowSprite([255, 226, 180]), x, y, G.m * 0.08, 0.7 * I);
		drawSprite(glowSprite(WHITE), x, y, 4, I);
	}
}
function dining33(p: number, t: number, I: number): void {
	// 3-3: 저울에 매단 상자가 위아래로 흔들리고, 시계 바늘이 휜다
	if (I <= 0.003) return;
	const L = diningLayout();
	const b = boxSize();
	const amp = 0.022 * H * smooth(SHAKE_IN[0], SHAKE_IN[1], p);
	const bob = (REDUCED ? 0.6 : Math.sin(t * 2.4)) * amp;
	const restBottom = L.tableY - 0.02 * H;
	const baseY = restBottom + bob;
	const anchor = -0.02 * H;
	const boxTop = baseY - b - b * 0.22;
	// 용수철
	const coils = 14;
	const springTop = anchor + 0.04 * H;
	const springBottom = boxTop - 0.025 * H;
	const pts = [W / 2, anchor, W / 2, springTop];
	for (let i = 1; i <= coils; i++)
		pts.push(
			W / 2 + (i % 2 === 0 ? -1 : 1) * b * 0.11,
			lerp(springTop, springBottom, i / (coils + 1))
		);
	pts.push(W / 2, springBottom, W / 2, boxTop + b * 0.11);
	ctx.globalCompositeOperation = 'lighter';
	glowLine(pts, 1, [235, 210, 175], 0.75 * I);
	// 눈금자와 바늘(상자 높이)
	const rulerX = W / 2 - b * 0.95;
	const tickGap = 0.018 * H;
	for (let k = -5; k <= 5; k++) {
		const y = restBottom - b * 0.5 + k * tickGap;
		strokePoly(
			[rulerX - (k % 5 === 0 ? 8 : 5), y, rulerX, y],
			1,
			'rgb(255,226,190)',
			(k % 5 === 0 ? 0.6 : 0.35) * I
		);
	}
	glowLine(
		[rulerX, restBottom - b * 0.5 - 5.5 * tickGap, rulerX, restBottom - b * 0.5 + 5.5 * tickGap],
		0.8,
		[255, 214, 170],
		0.4 * I
	);
	const pointerY = baseY - b * 0.5;
	glowLine([rulerX + 3, pointerY, W / 2 - b / 2 - 2, pointerY], 1, [255, 226, 160], 0.8 * I);
	drawSprite(glowSprite([255, 214, 150]), rulerX, pointerY, 10, 0.8 * I);
	const bend =
		0.6 * smooth(BEND_IN[0], BEND_IN[1], p) * (REDUCED ? 1 : 0.75 + 0.25 * Math.sin(t * 2.4 + 0.8));
	drawClockBox(W / 2, baseY, b, I, 0, t, bend);
	// 시계 둘레의 일렁임(높이에 따라 시간이 달리 흐른다)
	const warp = smooth(WARP_IN[0], WARP_IN[1], p) * I;
	if (warp > 0.003) {
		const ccy = baseY - b + b * 0.47;
		for (let k = 0; k < 3; k++) {
			const phase = REDUCED ? k / 3 : (t * 0.4 + k / 3) % 1;
			drawSprite(
				ringSprite([255, 220, 180]),
				W / 2,
				ccy,
				b * (0.35 + phase * 0.6),
				0.25 * (1 - phase) * warp
			);
		}
	}
}
export function chapter3(s: number, local: number, t: number): void {
	const L = diningLayout();
	const w = dayWeights(s);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, W, H);
	drawSky(L, w, t);
	paintLayer(diningLayer(), 1);
	const shafts = drawDiningShafts(L, w);
	const lights = L.windows.map((win) => ({
		x: win.x + shafts.shift * 0.6,
		y: lerp(win.y + win.h, L.tableFront, 0.45),
		I: shafts.power * 4.5,
		R2: Math.pow(G.m * 0.2, 2)
	}));
	const dustOptions: DustOptions = {
		tint: w.night > 0.5 ? 'cool' : 'warm',
		vis: 0.9,
		drift: 0.15 * s,
		scroll: local,
		lights,
		laser: null,
		glint: 0.4 * w.morning,
		t,
		ambient: 0.08
	};
	dustLayers(dustOptions, 0, 1);
	drawBeats([dining31, dining32, dining33], s, t, local);
	drawTwinEdges(t, 0);
	drawDust(dustOptions, 2);
}
