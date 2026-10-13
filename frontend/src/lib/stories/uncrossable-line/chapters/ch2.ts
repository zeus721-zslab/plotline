// 2장 문을 연 사람(시제품 flow.src.html :2404-2834): 1905 베른 특허청(호박색 실내). 금속판 · 확률 구름 · 빛으로 된 주사위.
import {
	clamp01,
	COLOR_A,
	COLOR_B,
	ctx,
	darken,
	dotSprite,
	drawBeats,
	drawCoveredCoin,
	drawDust,
	emberSprite,
	drawLight,
	drawSprite,
	drawTwinEdges,
	dustLayers,
	G,
	gauss,
	glowLine,
	glowSprite,
	H,
	hash,
	lerp,
	mixWhite,
	paintLayer,
	paintPiece,
	REDUCED,
	rgba,
	ringSprite,
	seeded,
	smooth,
	starSprite,
	strokePoly,
	vignetteOn,
	W,
	WHITE,
	type DustOptions,
	type Piece,
	type Rgb
} from '../linePaint.ts';
import { layer, piece, rimLight } from '../lineLayers.ts';

type OfficeLayout = {
	deskY: number;
	lamp: { x: number; y: number };
	win: { x: number; y: number; w: number; h: number };
	stack: { x: number; w: number };
	coin: { x: number };
};
export function officeLayout(): OfficeLayout {
	const portrait = G.portrait;
	return {
		deskY: (portrait ? 0.6 : 0.62) * H,
		lamp: { x: (portrait ? 0.2 : 0.22) * W, y: (portrait ? 0.46 : 0.44) * H },
		win: {
			x: (portrait ? 0.56 : 0.62) * W,
			y: 0.05 * H,
			w: (portrait ? 0.34 : 0.22) * W,
			h: 0.3 * H
		},
		stack: { x: (portrait ? 0.74 : 0.76) * W, w: (portrait ? 0.24 : 0.14) * W },
		coin: { x: (portrait ? 0.8 : 0.72) * W }
	};
}
export function officeLayer(): HTMLCanvasElement {
	return layer('office', (g) => {
		const L = officeLayout();
		g.fillStyle = '#0b0805';
		g.fillRect(0, 0, W, H);
		const wall = g.createRadialGradient(L.lamp.x, L.lamp.y, 0, L.lamp.x, L.lamp.y, G.diag * 0.75);
		wall.addColorStop(0, 'rgba(130,78,34,0.6)');
		wall.addColorStop(0.4, 'rgba(60,36,18,0.4)');
		wall.addColorStop(1, 'rgba(0,0,0,0)');
		g.fillStyle = wall;
		g.fillRect(0, 0, W, H);
		// 먼 층(초점 밖): 창문과 서류철 선반
		const random = seeded(17);
		const win = L.win;
		g.save();
		g.filter = `blur(${(3 * G.sizeScale).toFixed(1)}px)`;
		const sky = g.createLinearGradient(0, win.y, 0, win.y + win.h);
		sky.addColorStop(0, 'rgba(150,170,190,0.34)');
		sky.addColorStop(1, 'rgba(235,205,160,0.24)');
		g.fillStyle = sky;
		g.fillRect(win.x, win.y, win.w, win.h);
		g.fillStyle = 'rgba(12,9,6,0.95)';
		g.fillRect(win.x + win.w / 2 - 2, win.y, 4, win.h);
		g.fillRect(win.x, win.y + win.h * 0.45 - 2, win.w, 4);
		g.lineWidth = 6;
		g.strokeStyle = 'rgba(20,14,9,1)';
		g.strokeRect(win.x, win.y, win.w, win.h);
		const shelfX1 = win.x - 0.04 * W;
		for (const sy of [0.17, 0.32]) {
			const y = sy * H;
			g.fillStyle = 'rgba(30,20,12,0.95)';
			g.fillRect(0, y, shelfX1, 0.008 * H);
			let x = 4;
			while (x < shelfX1 - 8) {
				const bw = (0.025 + random() * 0.028) * G.m;
				const bh = (0.07 + random() * 0.04) * H;
				const tone = 30 + Math.floor(random() * 30);
				g.fillStyle = `rgb(${tone + 22},${tone + 8},${tone - 8})`;
				g.fillRect(x, y - bh, bw - 2, bh);
				x += bw;
			}
		}
		g.restore();
		// 창에서 책상으로 비스듬히 내려오는 빛줄기
		g.globalCompositeOperation = 'lighter';
		const shaft = g.createLinearGradient(win.x, win.y, win.x - 0.25 * W, L.deskY);
		shaft.addColorStop(0, 'rgba(255,226,180,0.13)');
		shaft.addColorStop(1, 'rgba(255,226,180,0)');
		g.fillStyle = shaft;
		g.beginPath();
		g.moveTo(win.x, win.y + win.h * 0.2);
		g.lineTo(win.x + win.w, win.y + win.h * 0.4);
		g.lineTo(win.x + win.w * 0.4 - 0.15 * W, L.deskY + 0.05 * H);
		g.lineTo(win.x - 0.3 * W, L.deskY);
		g.closePath();
		g.fill();
		g.globalCompositeOperation = 'source-over';
		// 책상(가까운 층): 나뭇결 상판과 앞 가장자리
		const deskDepth = 0.17 * H;
		const top = g.createLinearGradient(0, L.deskY, 0, L.deskY + deskDepth);
		top.addColorStop(0, '#2b1b0f');
		top.addColorStop(1, '#130b06');
		g.fillStyle = top;
		g.fillRect(0, L.deskY, W, deskDepth);
		for (let i = 0; i < 26; i++) {
			const y = L.deskY + random() * deskDepth;
			g.strokeStyle = `rgba(255,190,120,${(0.015 + random() * 0.03).toFixed(3)})`;
			g.lineWidth = 0.6 + random();
			g.beginPath();
			g.moveTo(0, y);
			g.bezierCurveTo(
				W * 0.3,
				y + (random() - 0.5) * 8,
				W * 0.6,
				y + (random() - 0.5) * 8,
				W,
				y + (random() - 0.5) * 6
			);
			g.stroke();
		}
		g.fillStyle = 'rgba(255,200,140,0.35)';
		g.fillRect(0, L.deskY, W, 1);
		const frontY = L.deskY + deskDepth;
		g.fillStyle = '#080504';
		g.fillRect(0, frontY, W, H - frontY);
		g.fillStyle = 'rgba(255,190,130,0.25)';
		g.fillRect(0, frontY, W, 1);
		// 램프 불빛이 책상에 고인 자리
		g.globalCompositeOperation = 'lighter';
		g.save();
		g.translate(L.lamp.x, L.deskY + 0.04 * H);
		g.scale(1, 0.28);
		const pool = g.createRadialGradient(0, 0, 0, 0, 0, G.m * 0.6);
		pool.addColorStop(0, 'rgba(255,190,110,0.45)');
		pool.addColorStop(1, 'rgba(255,190,110,0)');
		g.fillStyle = pool;
		g.fillRect(-G.m * 0.6, -G.m * 0.6, G.m * 1.2, G.m * 1.2);
		g.restore();
		g.globalCompositeOperation = 'source-over';
		// 램프: 받침 · 대 · 초록 갓
		const lx = L.lamp.x;
		const ly = L.lamp.y;
		const sw = G.m * 0.13;
		g.fillStyle = '#0a0705';
		g.beginPath();
		g.ellipse(lx, L.deskY + 0.012 * H, sw * 0.45, sw * 0.1, 0, 0, Math.PI * 2);
		g.fill();
		g.fillRect(lx - 1.5, ly, 3, L.deskY - ly);
		const shade = g.createLinearGradient(0, ly - sw * 0.35, 0, ly + sw * 0.05);
		shade.addColorStop(0, '#24553a');
		shade.addColorStop(1, '#0b2116');
		g.fillStyle = shade;
		g.beginPath();
		g.ellipse(lx, ly, sw * 0.62, sw * 0.32, 0, Math.PI, 0);
		g.closePath();
		g.fill();
		g.strokeStyle = 'rgba(160,255,200,0.3)';
		g.lineWidth = 1;
		g.stroke();
		// 서류 더미
		const st = L.stack;
		for (let i = 0; i < 9; i++) {
			const y = L.deskY + 0.02 * H - i * 0.011 * H;
			const x = st.x - st.w / 2 + (random() - 0.5) * 0.02 * W;
			g.globalAlpha = 0.55;
			g.fillStyle = `rgb(${120 + i * 6},${100 + i * 5},${76 + i * 4})`;
			g.fillRect(x, y, st.w, 0.009 * H);
			g.globalAlpha = 0.85;
			g.fillStyle = 'rgba(255,226,180,0.5)';
			g.fillRect(x, y, st.w, 1);
		}
		g.globalAlpha = 1;
		vignetteOn(g, W * 0.45, H * 0.45, 0.65);
	});
}
type Plate = {
	x: number;
	w: number;
	top: number;
	bottom: number;
	depth: number;
	hitX: number;
	hitY: number;
};
function plateGeometry(): Plate {
	const L = officeLayout();
	const w = (G.portrait ? 0.17 : 0.08) * W;
	const x = 0.6 * W;
	const top = 0.13 * H;
	const bottom = L.deskY + 0.02 * H;
	const depth = w * 0.3;
	return { x, w, top, bottom, depth, hitX: x + w * 0.3, hitY: (top + bottom) / 2 - depth * 0.3 };
}
function platePiece(): Piece {
	const P = plateGeometry();
	return piece(
		'plate',
		P.x - 6,
		P.top - P.depth - 6,
		P.w + 12,
		P.bottom - P.top + P.depth + 12,
		(g) => {
			const quad = (): void => {
				g.beginPath();
				g.moveTo(P.x, P.top);
				g.lineTo(P.x + P.w, P.top - P.depth);
				g.lineTo(P.x + P.w, P.bottom - P.depth);
				g.lineTo(P.x, P.bottom);
				g.closePath();
			};
			const metal = g.createLinearGradient(P.x, P.top, P.x + P.w, P.bottom);
			metal.addColorStop(0, '#3a3a3e');
			metal.addColorStop(0.35, '#18181b');
			metal.addColorStop(0.5, '#8d8a86');
			metal.addColorStop(0.56, '#2a2a2d');
			metal.addColorStop(1, '#0e0e10');
			quad();
			g.fillStyle = metal;
			g.fill();
			g.save();
			quad();
			g.clip();
			const random = seeded(23);
			for (let i = 0; i < 80; i++) {
				const y = P.top + random() * (P.bottom - P.top);
				g.strokeStyle = `rgba(255,255,255,${(random() * 0.06).toFixed(3)})`;
				g.lineWidth = 0.6;
				g.beginPath();
				g.moveTo(P.x, y);
				g.lineTo(P.x + P.w, y - P.depth);
				g.stroke();
			}
			const warm = g.createLinearGradient(P.x, 0, P.x + P.w, 0);
			warm.addColorStop(0, 'rgba(255,170,90,0.28)');
			warm.addColorStop(1, 'rgba(255,170,90,0)');
			g.fillStyle = warm;
			g.fillRect(P.x, P.top - P.depth, P.w, P.bottom - P.top + P.depth);
			g.restore();
			const rim = g.createLinearGradient(0, P.top, 0, P.bottom);
			rim.addColorStop(0, 'rgba(255,230,200,0.75)');
			rim.addColorStop(1, 'rgba(255,230,200,0.1)');
			rimLight(g, quad, rim, 1.2);
		}
	);
}
const RED_GRAINS = 10;
const ELECTRON_COUNT = 70;
const electrons = (() => {
	const random = seeded(55);
	const e = {
		angle: new Float32Array(ELECTRON_COUNT),
		speed: new Float32Array(ELECTRON_COUNT),
		size: new Float32Array(ELECTRON_COUNT),
		bright: new Float32Array(ELECTRON_COUNT)
	};
	for (let i = 0; i < ELECTRON_COUNT; i++) {
		e.angle[i] = Math.PI + gauss(random) * 0.7;
		e.speed[i] = 0.25 + Math.pow(random(), 0.7) * 0.95;
		e.size[i] = 0.8 + random() * 1.8;
		e.bright[i] = 0.5 + random() * 0.5;
	}
	return e;
})();
function drawElectrons(x0: number, y0: number, tau: number, I: number): void {
	const tail = new Path2D();
	const sprite = emberSprite([170, 225, 255]);
	const f = 1 - Math.exp(-4 * tau);
	const fp = 1 - Math.exp(-4 * Math.max(0, tau - 0.06));
	const fade = I * (1 - 0.55 * tau);
	for (let i = 0; i < ELECTRON_COUNT; i++) {
		const reach = G.m * 0.55 * electrons.speed[i];
		const dx = Math.cos(electrons.angle[i]);
		const dy = Math.sin(electrons.angle[i]);
		const x = x0 + dx * reach * f;
		const y = y0 + dy * reach * f + tau * tau * G.m * 0.05;
		tail.moveTo(x0 + dx * reach * fp, y0 + dy * reach * fp);
		tail.lineTo(x, y);
		drawSprite(sprite, x, y, electrons.size[i] * G.sizeScale * 2.2, fade * electrons.bright[i]);
	}
	ctx.globalAlpha = Math.min(1, 0.5 * fade);
	ctx.lineWidth = 1.2;
	ctx.lineCap = 'round';
	ctx.strokeStyle = 'rgb(170,225,255)';
	ctx.stroke(tail);
}
function office21(p: number, t: number, I: number): void {
	// 2-1: 서류 더미 위로 램프 빛 · 펜촉의 작은 반짝임
	const L = officeLayout();
	ctx.globalCompositeOperation = 'lighter';
	drawSprite(glowSprite([255, 214, 160]), L.stack.x, L.deskY - 0.06 * H, G.m * 0.22, 0.12 * I);
	const glint = REDUCED ? 0.6 : 0.5 + 0.5 * Math.sin(t * 2.1);
	drawSprite(
		starSprite(),
		L.stack.x - L.stack.w * 0.65,
		L.deskY + 0.03 * H,
		10 + 4 * glint,
		0.45 * glint * I
	);
}
function office22(p: number, t: number, I: number): void {
	// 2-2: 금속판. 붉은 알갱이는 희미하게 튕겨 나가고, 파란 알갱이 하나가 닿자 전자가 튀어나온다
	const P = plateGeometry();
	const on = smooth(0, 0.12, p) * I;
	if (on <= 0.003) return;
	ctx.globalCompositeOperation = 'source-over';
	paintPiece(platePiece(), on);
	ctx.globalCompositeOperation = 'lighter';
	const red = glowSprite([255, 80, 56]);
	const redCore = dotSprite([255, 170, 150]);
	const span = P.bottom - P.top;
	for (let k = 0; k < RED_GRAINS; k++) {
		const phase = REDUCED
			? (k / RED_GRAINS + 0.37) % 1
			: (t * 0.32 + k / RED_GRAINS + hash(k) * 0.07) % 1;
		const y0 = P.hitY + (hash(k * 3.3) - 0.5) * span * 0.6;
		let x: number;
		let y: number;
		let a: number;
		if (phase < 0.72) {
			const f = phase / 0.72;
			x = lerp(-0.06 * W, P.hitX, f);
			y = lerp(y0 + (hash(k * 7.1) - 0.5) * 0.2 * H, y0, f);
			a = 0.3;
		} else {
			const f = (phase - 0.72) / 0.28;
			x = P.hitX - f * 0.22 * W;
			y = y0 - f * (hash(k * 5.7) - 0.3) * 0.18 * H;
			a = 0.3 * (1 - f);
			if (f < 0.15) drawSprite(red, P.hitX, y0, G.m * 0.05, 0.3 * (1 - f / 0.15) * on);
		}
		drawSprite(red, x, y, G.m * 0.045, a * on);
		drawSprite(redCore, x, y, 3, a * 1.6 * on);
	}
	const fly = clamp01((p - 0.4) / 0.2);
	if (p < 0.6 && fly > 0) {
		const x = lerp(-0.06 * W, P.hitX, fly);
		drawLight(x, P.hitY, 0.85 * on, [110, 150, 255], { angle: 0, len: G.m * 0.3 });
	}
	if (p >= 0.6) {
		const since = p - 0.6;
		const flash = Math.exp(-since / 0.04);
		drawSprite(glowSprite([140, 180, 255]), P.hitX, P.hitY, G.m * 0.4, 0.6 * flash * on);
		drawSprite(glowSprite(WHITE), P.hitX, P.hitY, G.m * 0.05, flash * on);
		drawSprite(glowSprite([120, 170, 255]), P.hitX, P.hitY, G.m * 0.12, 0.3 * on);
		drawElectrons(P.hitX, P.hitY, since / 0.4, on);
	}
}
const CLOUD_DOTS = 130;
const CLOUD_COLORS: Rgb[] = [COLOR_A, COLOR_B, [130, 205, 255], [255, 196, 130]];
const cloudOffsets = (() => {
	const random = seeded(71);
	const n = CLOUD_DOTS * CLOUD_COLORS.length;
	const c = { x: new Float32Array(n), y: new Float32Array(n), size: new Float32Array(n) };
	for (let i = 0; i < n; i++) {
		c.x[i] = gauss(random);
		c.y[i] = gauss(random) * 0.8;
		c.size[i] = 0.6 + random() * 1.6;
	}
	return c;
})();
function office23(p: number, t: number, I: number): void {
	// 2-3: 알갱이들이 확률 구름으로 번져 위치가 흐려진다
	if (I <= 0.003) return;
	ctx.globalCompositeOperation = 'lighter';
	const spreadK = smooth(0.04, 0.75, p);
	const spread = G.m * lerp(0.006, 0.1, spreadK);
	const centers = G.portrait
		? [
				[0.3, 0.22],
				[0.7, 0.18],
				[0.42, 0.4],
				[0.74, 0.44]
			]
		: [
				[0.3, 0.28],
				[0.55, 0.18],
				[0.42, 0.46],
				[0.7, 0.4]
			];
	for (let c = 0; c < CLOUD_COLORS.length; c++) {
		const cx = centers[c][0] * W + (REDUCED ? 0 : Math.sin(t * 0.4 + c) * G.m * 0.01);
		const cy = centers[c][1] * H + (REDUCED ? 0 : Math.cos(t * 0.33 + c * 2) * G.m * 0.008);
		const color = CLOUD_COLORS[c];
		drawSprite(glowSprite(color), cx, cy, spread * 3.4 + G.m * 0.03, (0.16 + 0.14 * spreadK) * I);
		drawSprite(glowSprite(color), cx, cy, spread * 1.4 + G.m * 0.012, (0.22 + 0.1 * spreadK) * I);
		const dot = dotSprite(mixWhite(color, 0.35));
		const alpha = I * lerp(0.95, 0.6, spreadK);
		for (let k = 0; k < CLOUD_DOTS; k++) {
			const i = c * CLOUD_DOTS + k;
			const breathe = REDUCED ? 1 : 1 + 0.08 * Math.sin(t * 0.9 + k);
			drawSprite(
				dot,
				cx + cloudOffsets.x[i] * spread * breathe,
				cy + cloudOffsets.y[i] * spread * breathe,
				cloudOffsets.size[i] * 1.6,
				alpha * (k % 3 === 0 ? 1 : 0.55)
			);
		}
		// 가운데 또렷한 점이 흐려진다(어디 있는지 알 수 없게)
		drawSprite(glowSprite(WHITE), cx, cy, 4, I * (1 - spreadK));
	}
}
// 빛으로 된 주사위: 면마다 정해진 눈(1-6 · 2-5 · 3-4 마주봄)
type Vec3 = [number, number, number];
type DieFace = { n: Vec3; u: Vec3; v: Vec3; pips: [number, number][] };
const DIE_FACES: DieFace[] = [
	{ n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], pips: [[0, 0]] },
	{
		n: [0, 0, 1],
		u: [-1, 0, 0],
		v: [0, 1, 0],
		pips: [
			[-1, -1],
			[-1, 0],
			[-1, 1],
			[1, -1],
			[1, 0],
			[1, 1]
		]
	},
	{
		n: [1, 0, 0],
		u: [0, 0, 1],
		v: [0, 1, 0],
		pips: [
			[-1, -1],
			[0, 0],
			[1, 1]
		]
	},
	{
		n: [-1, 0, 0],
		u: [0, 0, -1],
		v: [0, 1, 0],
		pips: [
			[-1, -1],
			[-1, 1],
			[1, -1],
			[1, 1]
		]
	},
	{
		n: [0, -1, 0],
		u: [1, 0, 0],
		v: [0, 0, 1],
		pips: [
			[-1, -1],
			[1, 1]
		]
	},
	{
		n: [0, 1, 0],
		u: [1, 0, 0],
		v: [0, 0, -1],
		pips: [
			[-1, -1],
			[-1, 1],
			[0, 0],
			[1, -1],
			[1, 1]
		]
	}
];
const DIE_YAW = 0.55;
const DIE_PITCH = -0.42;
const DIE_PERSPECTIVE = 7;
const DIE_ROLL_TOTAL = Math.PI * 2.5 + 0.5; // 모서리로 선 채 넘어가기 직전에 멈춘다
function dieTransform(v: Vec3, roll: number): Vec3 {
	let x = v[0];
	let y = v[1];
	let z = v[2];
	let c = Math.cos(roll);
	let sn = Math.sin(roll);
	[x, y] = [x * c - y * sn, x * sn + y * c];
	c = Math.cos(DIE_YAW);
	sn = Math.sin(DIE_YAW);
	[x, z] = [x * c + z * sn, -x * sn + z * c];
	c = Math.cos(DIE_PITCH);
	sn = Math.sin(DIE_PITCH);
	[y, z] = [y * c - z * sn, y * sn + z * c];
	return [x, y, z];
}
function renderDie(cx: number, cy: number, half: number, roll: number, I: number): void {
	if (I <= 0.003) return;
	const project = (v: Vec3): [number, number] => {
		const q = dieTransform(v, roll);
		const k = DIE_PERSPECTIVE / (DIE_PERSPECTIVE + q[2]);
		return [cx + q[0] * half * k, cy + q[1] * half * k];
	};
	const edge: Rgb = [255, 214, 160];
	for (const face of DIE_FACES) {
		const n = dieTransform(face.n, roll);
		const corner = (a: number, b: number): [number, number] =>
			project([
				face.n[0] + face.u[0] * a + face.v[0] * b,
				face.n[1] + face.u[1] * a + face.v[1] * b,
				face.n[2] + face.u[2] * a + face.v[2] * b
			]);
		const pts = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
		const flat: number[] = [];
		for (const q of pts) flat.push(q[0], q[1]);
		flat.push(pts[0][0], pts[0][1]);
		if (n[2] >= 0) {
			strokePoly(flat, 1, rgba(edge, 1), 0.12 * I);
			continue;
		}
		// 위를 향한 면일수록 램프 빛을 더 받는다
		const light = 0.5 + 0.5 * Math.max(0, -n[1]);
		ctx.globalAlpha = Math.min(1, (0.07 + 0.1 * light) * I);
		ctx.fillStyle = 'rgb(255,190,120)';
		ctx.beginPath();
		ctx.moveTo(flat[0], flat[1]);
		for (let i = 2; i < 8; i += 2) ctx.lineTo(flat[i], flat[i + 1]);
		ctx.closePath();
		ctx.fill();
		glowLine(flat, 1.3, edge, 0.85 * I);
		for (const [a, b] of face.pips) {
			const q = corner(a * 0.5, b * 0.5);
			drawSprite(glowSprite([255, 236, 210]), q[0], q[1], half * 0.24, 0.65 * I);
			drawSprite(glowSprite(WHITE), q[0], q[1], half * 0.08, I);
		}
	}
}
function office24(p: number, t: number, I: number): void {
	// 2-4: 빛으로 된 주사위가 느린 동작으로 구르다 멈추기 직전 정지 · 곁에 덮인 동전
	if (I <= 0.003) return;
	const L = officeLayout();
	ctx.globalCompositeOperation = 'lighter';
	const half = G.m * 0.07 + 6;
	const go = clamp01(p / 0.8);
	const x0 = (G.portrait ? 0.12 : 0.24) * W;
	const x1 = 0.48 * W;
	const place = (e: number): { x: number; y: number; roll: number } => {
		const roll = DIE_ROLL_TOTAL * e;
		const r = ((roll % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
		return {
			x: lerp(x0, x1, e),
			y: L.deskY + 0.015 * H - half * Math.SQRT2 * Math.cos(r - Math.PI / 4),
			roll
		};
	};
	// 끝까지 서지 않는 감속: 멈추는 순간에도 아직 구르고 있다
	const eased = go * (1.3 - 0.3 * go);
	const ghosts = REDUCED || go >= 1 ? 0 : 3;
	for (let gi = ghosts; gi >= 1; gi--) {
		const g = place(Math.max(0, eased - gi * 0.03));
		renderDie(g.x, g.y, half, g.roll, (I * 0.16) / gi);
	}
	const now = place(eased);
	const tremble = go >= 1 && !REDUCED ? Math.sin(t * 14) * 0.5 : 0;
	drawSprite(glowSprite([255, 200, 130]), now.x, now.y, half * 3.2, 0.18 * I);
	renderDie(now.x + tremble, now.y, half, now.roll, I);
	// 책상에 비친 주사위 빛
	ctx.globalAlpha = Math.min(1, 0.25 * I);
	ctx.drawImage(glowSprite([255, 200, 130]), now.x - half, L.deskY + 0.01 * H, half * 2, 0.12 * H);
	const freeze = smooth(0.8, 0.96, p);
	if (freeze > 0 && freeze < 1)
		drawSprite(
			ringSprite([255, 230, 200]),
			now.x,
			now.y,
			freeze * G.m * 0.4,
			(1 - freeze) * 0.45 * I
		);
	drawCoveredCoin(L.coin.x, L.deskY + 0.05 * H, G.m * 0.045 + 4, 0.55 * smooth(0.1, 0.4, p) * I);
}
export function chapter2(s: number, local: number, t: number): void {
	const L = officeLayout();
	paintLayer(officeLayer(), 1);
	ctx.globalCompositeOperation = 'lighter';
	const flicker = REDUCED ? 1 : 0.95 + 0.05 * Math.sin(t * 8.3) * Math.sin(t * 2.9);
	const bulb = { x: L.lamp.x, y: L.lamp.y + G.m * 0.012 };
	drawSprite(glowSprite([255, 196, 120]), bulb.x, bulb.y, G.m * 0.55, 0.22 * flicker);
	drawSprite(glowSprite([255, 226, 180]), bulb.x, bulb.y, G.m * 0.07, 0.8 * flicker);
	const cloud = smooth(2.0, 2.2, s) * (1 - smooth(3.0, 3.2, s));
	const dustOptions: DustOptions = {
		tint: 'amber',
		vis: 1 - 0.5 * cloud,
		drift: 0.2 * s,
		scroll: local,
		lights: [
			{ x: bulb.x, y: bulb.y, I: 1.1 * flicker, R2: Math.pow(G.m * 0.3, 2) },
			{ x: L.win.x - 0.08 * W, y: L.deskY * 0.62, I: 0.7, R2: Math.pow(G.m * 0.32, 2) }
		],
		laser: null,
		glint: 0.5 * (1 - cloud),
		t,
		ambient: 0.1
	};
	dustLayers(dustOptions, 0, 1);
	darken(0.45 * cloud);
	drawBeats([office21, office22, office23, office24], s, t, local);
	drawTwinEdges(t, 0);
	drawDust(dustOptions, 2);
}
