// 넘을 수 없는 선 미리 그리는 것(시제품 flow.src.html :662-1312 장면별 미리 그림, :2241-2262 장 배경 캐시).
// 화면 크기(W×H×DPR)가 바뀔 때마다 렌더러가 rebuildLayers 로 다시 만든다. 장 배경(layer · piece)은 키에 W×H×DPR 을 넣어 최근 것만 들고 있는다.
import {
	bokehSprite,
	context2d,
	ctx,
	dpr,
	G,
	gauss,
	glowSprite,
	H,
	lerp,
	makeCanvas,
	roundRectPath,
	seeded,
	sizeKey,
	SPECTRUM,
	rgba,
	W,
	type Piece,
	type Point,
	type Rect
} from './linePaint.ts';

export type Crack = { x: number; branches: number[][] };
export type Geometry = {
	portrait: boolean;
	m: number;
	diag: number;
	sizeScale: number;
	C: Point;
	A: Point;
	B: Point;
	laserY: number;
	n75: Point;
	n84: Point;
	tankA: Rect;
	tankB: Rect;
	gateA: Point;
	gateB: Point;
	gateW: number;
	smallNum: number;
	n84Size: number;
	numSize: number;
	tableY: number;
	tableFront: number;
	numY0: number;
	gaugeY: number;
	lineY2: number;
	numY1: number;
	bendMax: number;
	beamY: number;
	split: Point;
	gateU: Point;
	gateD: Point;
	tank0: Rect;
	full: Rect;
	stripe: number;
	roomA: Rect;
	roomB: Rect;
	cracks: Crack[];
};

export function geometry(): Geometry {
	const portrait = W < H * 0.9;
	const m = Math.min(W, H);
	const P = (x: number, y: number): Point => ({ x: x * W, y: y * H });
	// 장면 1 구도: 원자 C 에서 사선(dir)으로 두 빛 A·B → 물통 → 창살 문이 한 줄로 놓인다
	const dir = portrait ? { x: -0.2, y: 0.12 } : { x: -0.21, y: 0.13 };
	const C = portrait ? { x: 0.5, y: 0.38 } : { x: 0.5, y: 0.44 };
	const along = (k: number): Point => P(C.x + dir.x * k, C.y + dir.y * k);
	const against = (k: number): Point => P(C.x - dir.x * k, C.y - dir.y * k);
	const tw = 0.085 * m + 8;
	const th = tw * 1.18;
	const tankA = { ...along(1.5), w: tw, h: th };
	const tankB = { ...against(1.5), w: tw, h: th };
	// 장면 2
	const numSize = Math.min(0.34 * W, 0.24 * H);
	const tableY = 0.62 * H;
	const numY0 = (portrait ? 0.33 : 0.36) * H;
	// 8-3 두 방: 1장 물통 자리에서 크게 본 물통
	const roomW = portrait ? 0.2 * W : 0.11 * W;
	// 8-3 의 선이 갈라지는 자리와 잔금
	const random = seeded(29);
	const cracks = [0.18, 0.37, 0.55, 0.71, 0.88].map((fx) => {
		const branches: number[][] = [];
		const count = 2 + Math.floor(random() * 2);
		for (let b = 0; b < count; b++) {
			const pts = [0, 0];
			let px = 0;
			let py = 0;
			const sign = random() < 0.5 ? -1 : 1;
			const base = (random() - 0.5) * 1.6;
			for (let s = 0; s < 5; s++) {
				const angle = base + (random() - 0.5) * 0.9;
				const step = 5 + random() * 9;
				px += Math.sin(angle) * step;
				py += Math.cos(angle) * step * sign;
				pts.push(px, py);
			}
			branches.push(pts);
		}
		return { x: fx * W, branches };
	});
	return {
		portrait,
		m,
		diag: Math.hypot(W, H),
		sizeScale: Math.sqrt(m / 390),
		C: P(C.x, C.y),
		A: along(1),
		B: against(1),
		laserY: portrait ? 0.45 * H : 0.52 * H,
		n75: portrait ? P(0.82, 0.405) : P(0.88, 0.585),
		n84: portrait ? P(0.3, 0.27) : P(0.3, 0.25),
		tankA,
		tankB,
		gateA: along(2.1),
		gateB: against(2.1),
		gateW: 0.1 * m + 8,
		smallNum: 0.17 * m,
		n84Size: 0.26 * m,
		numSize,
		tableY,
		tableFront: (portrait ? 0.84 : 0.86) * H,
		numY0,
		gaugeY: numY0 + numSize * 0.56,
		lineY2: (portrait ? 0.24 : 0.26) * H,
		numY1: (portrait ? 0.15 : 0.14) * H,
		bendMax: 0.07 * H,
		// 장면 3
		beamY: (portrait ? 0.4 : 0.44) * H,
		split: P(portrait ? 0.36 : 0.4, portrait ? 0.4 : 0.44),
		gateU: P(0.84, portrait ? 0.2 : 0.24),
		gateD: P(0.84, 0.6),
		tank0: { x: 0.5 * W, y: 0.42 * H, w: tw * 2.2, h: th * 2.2 },
		full: { x: 0.5 * W, y: 0.5 * H, w: W * 1.7, h: H * 1.7 },
		stripe: m / 7,
		roomA: { x: tankA.x, y: tankA.y, w: roomW, h: roomW * 1.18 },
		roomB: { x: tankB.x, y: tankB.y, w: roomW, h: roomW * 1.18 },
		cracks
	};
}

function buildInk(): HTMLCanvasElement {
	const c = makeCanvas(W * dpr, H * dpr);
	const g = context2d(c);
	g.scale(dpr, dpr);
	g.fillStyle = '#0a0807';
	g.fillRect(0, 0, W, H);
	const haze = g.createRadialGradient(G.C.x, G.C.y, 0, G.C.x, G.C.y, G.diag * 0.7);
	haze.addColorStop(0, 'rgba(46,32,22,0.5)');
	haze.addColorStop(0.5, 'rgba(24,17,12,0.25)');
	haze.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = haze;
	g.fillRect(0, 0, W, H);
	const vignette = g.createRadialGradient(
		W / 2,
		H * 0.45,
		G.m * 0.3,
		W / 2,
		H * 0.45,
		G.diag * 0.62
	);
	vignette.addColorStop(0, 'rgba(0,0,0,0)');
	vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
	g.fillStyle = vignette;
	g.fillRect(0, 0, W, H);
	return c;
}

/** 필름 입자 무늬(화면 전체에 덮는 반복 무늬). 크기와 무관해 한 번만 만든다 */
export function buildGrain(): CanvasPattern | null {
	const size = 128;
	const c = makeCanvas(size, size);
	const g = context2d(c);
	const image = g.createImageData(size, size);
	const random = seeded(5);
	for (let i = 0; i < size * size; i++) {
		const v = random() < 0.5 ? 0 : 255;
		image.data[i * 4] = v;
		image.data[i * 4 + 1] = v;
		image.data[i * 4 + 2] = v;
		image.data[i * 4 + 3] = Math.floor(random() * 10);
	}
	g.putImageData(image, 0, 0);
	return ctx.createPattern(c, 'repeat');
}

export const LAB_EXTRA = 1.12; // 시차로 밀려도 아래가 비지 않게 더 그리는 높이 비율
export type LabLayout = {
	base: number;
	r: number;
	axisY: number;
	laser: { x0: number; x1: number };
	lenses: number[];
	source: number;
	detector: { x0: number; x1: number; box: number };
	lensR: number;
};
// 장면 2 장비 배치: 레이저 관 · 렌즈 받침대 · 원통형 광검출기가 한 광축(axisY)에 놓인다
function labLayout(): LabLayout {
	const portrait = G.portrait;
	const base = G.tableY + 0.03 * H;
	const r = (portrait ? 0.03 : 0.026) * G.m;
	const axisY = base - r * 1.5;
	return {
		base,
		r,
		axisY,
		laser: portrait ? { x0: -0.08 * W, x1: 0.3 * W } : { x0: 0.04 * W, x1: 0.27 * W },
		lenses: portrait ? [0.42, 0.62] : [0.4, 0.6],
		source: (portrait ? 0.52 : 0.5) * W,
		// 세로 화면엔 전자 상자가 없다(box 0)
		detector: portrait
			? { x0: 0.72 * W, x1: 1.06 * W, box: 0 }
			: { x0: 0.73 * W, x1: 0.93 * W, box: 0.06 * W },
		lensR: (portrait ? 0.036 : 0.032) * G.m
	};
}
export type LabPiece = Piece & { appear: [number, number] };
export function makePiece(
	x: number,
	y: number,
	w: number,
	h: number,
	draw: (g: CanvasRenderingContext2D) => void
): Piece {
	const c = makeCanvas(w * dpr, h * dpr);
	const g = context2d(c);
	g.scale(dpr, dpr);
	g.translate(-x, -y);
	draw(g);
	return { canvas: c, x, y, w, h };
}
function labPiece(
	x: number,
	y: number,
	w: number,
	h: number,
	appear: [number, number],
	draw: (g: CanvasRenderingContext2D) => void
): LabPiece {
	return { ...makePiece(x, y, w, h, draw), appear };
}
// 경로 안쪽에만 가장자리 빛(림 라이트)을 얹는다: 클립 후 두 배 굵기로 그어 안쪽 절반만 남긴다
export function rimLight(
	g: CanvasRenderingContext2D,
	path: () => void,
	style: CanvasGradient,
	width: number
): void {
	g.save();
	path();
	g.clip();
	path();
	g.lineWidth = width * 2;
	g.strokeStyle = style;
	g.stroke();
	g.restore();
}
type CylinderTone = { top: string; high: string; bottom: string };
function horizontalCylinder(
	g: CanvasRenderingContext2D,
	x0: number,
	x1: number,
	cy: number,
	r: number,
	tone: CylinderTone
): void {
	const path = (): void => roundRectPath(g, x0, cy - r, x1 - x0, r * 2, r * 0.3);
	const body = g.createLinearGradient(0, cy - r, 0, cy + r);
	body.addColorStop(0, tone.top);
	body.addColorStop(0.16, tone.high);
	body.addColorStop(0.34, '#110e0c');
	body.addColorStop(0.8, '#070605');
	body.addColorStop(1, tone.bottom);
	path();
	g.fillStyle = body;
	g.fill();
	// 위쪽은 따뜻한 천장등, 아래쪽은 차가운 반사광
	const rim = g.createLinearGradient(0, cy - r, 0, cy + r);
	rim.addColorStop(0, 'rgba(255,200,150,0.55)');
	rim.addColorStop(0.3, 'rgba(255,200,150,0)');
	rim.addColorStop(0.75, 'rgba(120,170,220,0)');
	rim.addColorStop(1, 'rgba(120,170,220,0.3)');
	rimLight(g, path, rim, 1.2);
}
export type Lab = { back: HTMLCanvasElement; pieces: LabPiece[]; layout: LabLayout; scope: Rect };
function buildLab(): Lab {
	const L = labLayout();
	const h = H * LAB_EXTRA;
	const back = makeCanvas(W * dpr, h * dpr);
	const g = context2d(back);
	g.scale(dpr, dpr);
	g.fillStyle = '#070605';
	g.fillRect(0, 0, W, h);
	const warm = g.createRadialGradient(W * 0.55, H * 0.3, 0, W * 0.55, H * 0.3, G.diag * 0.62);
	warm.addColorStop(0, 'rgba(92,60,34,0.6)');
	warm.addColorStop(0.45, 'rgba(38,26,18,0.35)');
	warm.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = warm;
	g.fillRect(0, 0, W, h);
	const cool = g.createRadialGradient(W * 0.06, H * 0.5, 0, W * 0.06, H * 0.5, G.m * 0.9);
	cool.addColorStop(0, 'rgba(34,62,78,0.42)');
	cool.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = cool;
	g.fillRect(0, 0, W, h);
	// 높은 창에서 비스듬히 들어오는 빛 기둥
	g.globalCompositeOperation = 'lighter';
	for (const [top, w0, bottom, a] of [
		[0.18, 0.05, 0.62, 0.065],
		[0.42, 0.03, 0.9, 0.04]
	]) {
		const shaft = g.createLinearGradient(0, 0, 0, H * 0.75);
		shaft.addColorStop(0, `rgba(255,205,150,${a})`);
		shaft.addColorStop(1, 'rgba(255,205,150,0)');
		g.fillStyle = shaft;
		g.beginPath();
		g.moveTo(W * top, -10);
		g.lineTo(W * (top + w0), -10);
		g.lineTo(W * (bottom + 0.14), H * 0.75);
		g.lineTo(W * (bottom - 0.12), H * 0.75);
		g.closePath();
		g.fill();
	}
	g.globalCompositeOperation = 'source-over';
	// 먼 층(초점 밖): 광학 기둥들과 뒤편 오실로스코프. 흐리게 그려 깊이를 준다
	g.save();
	g.filter = `blur(${(2.4 * G.sizeScale).toFixed(1)}px)`;
	g.fillStyle = 'rgba(4,3,3,0.78)';
	const farPosts = G.portrait
		? [
				[0.08, 0.36],
				[0.2, 0.42],
				[0.34, 0.47]
			]
		: [
				[0.12, 0.36],
				[0.22, 0.42],
				[0.34, 0.46],
				[0.66, 0.4]
			];
	for (const [px, top] of farPosts) {
		const pw = 0.012 * G.m;
		g.fillRect(W * px - pw / 2, H * top, pw, G.tableY - H * top);
		g.beginPath();
		g.arc(W * px, H * top + pw, pw * 1.8, 0, Math.PI * 2);
		g.fill();
		g.fillRect(W * px - pw * 1.6, H * (top + 0.06), pw * 3.2, pw * 1.2);
	}
	const scope = G.portrait
		? { x: 0.6 * W, y: G.tableY - 0.13 * H, w: 0.3 * W, h: 0.11 * H }
		: { x: 0.62 * W, y: G.tableY - 0.15 * H, w: 0.17 * W, h: 0.13 * H };
	roundRectPath(g, scope.x, scope.y, scope.w, scope.h, 6);
	g.fillStyle = 'rgba(10,9,8,0.92)';
	g.fill();
	g.restore();
	// 오실로스코프 화면: 초록 빛과 파형 한 줄
	g.save();
	g.globalCompositeOperation = 'lighter';
	g.filter = `blur(${(1.2 * G.sizeScale).toFixed(1)}px)`;
	const screen = {
		x: scope.x + scope.w * 0.08,
		y: scope.y + scope.h * 0.14,
		w: scope.w * 0.58,
		h: scope.h * 0.7
	};
	g.fillStyle = 'rgba(40,120,90,0.35)';
	g.fillRect(screen.x, screen.y, screen.w, screen.h);
	g.strokeStyle = 'rgba(140,255,190,0.75)';
	g.lineWidth = 1.4;
	g.beginPath();
	for (let i = 0; i <= 40; i++) {
		const fx = i / 40;
		const yy =
			screen.y + screen.h * (0.5 - 0.28 * Math.sin(fx * Math.PI * 5) * Math.exp(-fx * 1.4));
		if (i === 0) g.moveTo(screen.x + fx * screen.w, yy);
		else g.lineTo(screen.x + fx * screen.w, yy);
	}
	g.stroke();
	g.fillStyle = 'rgba(255,170,90,0.6)';
	for (let i = 0; i < 4; i++) {
		g.beginPath();
		g.arc(
			scope.x + scope.w * 0.8,
			scope.y + scope.h * (0.22 + i * 0.18),
			1.6 * G.sizeScale,
			0,
			Math.PI * 2
		);
		g.fill();
	}
	g.restore();
	// 천장에서 내려온 둥근 갓 조명 두 개
	g.fillStyle = 'rgba(6,5,4,0.85)';
	for (const lx of [0.3, 0.7]) {
		g.fillRect(W * lx - 0.75, 0, 1.5, H * 0.12);
		g.beginPath();
		g.ellipse(W * lx, H * 0.125, G.m * 0.06, G.m * 0.022, 0, Math.PI, 0);
		g.fill();
	}
	g.globalCompositeOperation = 'lighter';
	for (const lx of [0.3, 0.7]) {
		g.globalAlpha = 0.22;
		g.drawImage(
			glowSprite([255, 190, 120]),
			W * lx - G.m * 0.3,
			H * 0.13 - G.m * 0.12,
			G.m * 0.6,
			G.m * 0.3
		);
	}
	g.globalAlpha = 1;
	g.globalCompositeOperation = 'source-over';
	// 광학 테이블 상판: 뒤 가장자리(tableY)에서 앞 가장자리(tableFront)까지 비스듬히 내려다본 면
	const top = g.createLinearGradient(0, G.tableY, 0, G.tableFront);
	top.addColorStop(0, '#0c0a08');
	top.addColorStop(0.5, '#120f0c');
	top.addColorStop(1, '#17130f');
	g.fillStyle = top;
	g.fillRect(0, G.tableY, W, G.tableFront - G.tableY);
	// 상판의 나사 구멍 격자(원근)
	const depth = G.tableFront - G.tableY;
	const ROWS = 16;
	for (let i = 1; i <= ROWS; i++) {
		const f = Math.pow(i / ROWS, 1.7);
		const y = G.tableY + depth * f;
		const spacing = (8 + 22 * f) * G.sizeScale;
		const radius = (0.5 + 1.1 * f) * G.sizeScale;
		for (let x = W / 2 - Math.ceil(W / 2 / spacing) * spacing; x <= W; x += spacing) {
			g.fillStyle = 'rgba(0,0,0,0.75)';
			g.beginPath();
			g.ellipse(x, y, radius * 1.4, radius * 0.7, 0, 0, Math.PI * 2);
			g.fill();
			g.fillStyle = `rgba(255,214,170,${(0.04 + 0.05 * f).toFixed(3)})`;
			g.fillRect(x - radius * 1.2, y - radius * 0.9, radius * 2.4, 0.6);
		}
	}
	// 상판에 비친 빛: 장비 불빛을 세로로 늘인 반사
	g.globalCompositeOperation = 'lighter';
	const reflections: [number, number[], number, number][] = [
		[L.laser.x1, [172, 138, 255], 0.3, 0.05],
		[L.source, [255, 196, 130], 0.34, 0.08],
		[L.detector.x0, [170, 220, 255], 0.22, 0.05],
		[scope.x + scope.w * 0.35, [110, 255, 170], 0.16, 0.12],
		[W * 0.3, [255, 190, 120], 0.12, 0.2],
		[W * 0.7, [255, 190, 120], 0.1, 0.2]
	];
	for (const [rx, color, alpha, width] of reflections) {
		g.globalAlpha = alpha;
		g.drawImage(
			glowSprite(color),
			rx - (W * width) / 2,
			G.tableY + depth * 0.04,
			W * width,
			depth * 0.95
		);
		g.globalAlpha = alpha * 0.6;
		g.drawImage(glowSprite(color), rx - W * width * 1.4, G.tableY, W * width * 2.8, depth * 0.35);
	}
	g.globalAlpha = 1;
	g.globalCompositeOperation = 'source-over';
	// 뒤 가장자리 · 앞 가장자리의 빛
	g.fillStyle = 'rgba(255,196,140,0.22)';
	g.fillRect(0, G.tableY, W, 1);
	const front = G.tableFront;
	g.fillStyle = '#060504';
	g.fillRect(0, front, W, h - front);
	const edge = g.createLinearGradient(0, front, 0, front + 0.03 * H);
	edge.addColorStop(0, 'rgba(70,52,38,0.9)');
	edge.addColorStop(1, 'rgba(10,8,7,0)');
	g.fillStyle = edge;
	g.fillRect(0, front, W, 0.03 * H);
	g.globalCompositeOperation = 'lighter';
	g.globalAlpha = 0.5;
	g.drawImage(glowSprite([255, 200, 150]), -W * 0.1, front - 3, W * 1.2, 6);
	g.globalAlpha = 1;
	g.fillStyle = 'rgba(255,214,170,0.55)';
	g.fillRect(0, front, W, 1);
	// 테이블 아래(화면 아래 1/4)를 채운다: 상판 앞면 · 다리 그림자 · 광택 바닥에 비친 장비 불빛 · 바닥 보케
	g.globalCompositeOperation = 'source-over';
	const apron = 0.045 * H;
	const apronFill = g.createLinearGradient(0, front, 0, front + apron);
	apronFill.addColorStop(0, '#1d1611');
	apronFill.addColorStop(0.25, '#0f0b08');
	apronFill.addColorStop(1, '#070504');
	g.fillStyle = apronFill;
	g.fillRect(0, front + 1, W, apron);
	g.fillStyle = 'rgba(0,0,0,0.85)';
	for (const fx of [0.1, 0.9]) {
		g.beginPath();
		g.moveTo(W * fx - 0.025 * G.m, front + apron);
		g.lineTo(W * fx + 0.025 * G.m, front + apron);
		g.lineTo(W * fx + 0.04 * G.m, h);
		g.lineTo(W * fx - 0.04 * G.m, h);
		g.closePath();
		g.fill();
	}
	const floor = g.createLinearGradient(0, front + apron, 0, h);
	floor.addColorStop(0, 'rgba(40,30,22,0.55)');
	floor.addColorStop(0.4, 'rgba(18,14,11,0.3)');
	floor.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = floor;
	g.fillRect(0, front + apron, W, h - front - apron);
	g.globalCompositeOperation = 'lighter';
	// 바닥에 길게 비친 장비 불빛(상판 반사의 아래 연장)
	for (const [rx, color, alpha, width] of reflections) {
		g.globalAlpha = alpha * 0.55;
		g.drawImage(
			glowSprite(color),
			rx - W * width * 0.4,
			front + apron,
			W * width * 0.8,
			(h - front - apron) * 1.4
		);
	}
	g.globalAlpha = 0.35;
	g.drawImage(glowSprite([255, 200, 150]), -W * 0.1, front + apron - 2, W * 1.2, 5);
	g.globalAlpha = 0.18;
	g.drawImage(glowSprite([255, 190, 130]), -W * 0.2, front + apron, W * 1.4, 0.07 * H);
	// 바닥 보케: 테이블 아래 초점 밖 불빛
	const random = seeded(63);
	const bokehColors = [
		[255, 190, 120],
		[150, 190, 255],
		[255, 150, 110],
		[120, 230, 200]
	];
	for (let i = 0; i < 30; i++) {
		const bx = random() * W;
		const by = front + 0.02 * H + random() * (h - front - 0.02 * H);
		const br = (0.035 + random() * random() * 0.1) * G.m;
		g.globalAlpha = 0.3 + random() * 0.4;
		g.drawImage(bokehSprite(bokehColors[i % bokehColors.length]), bx - br, by - br, br * 2, br * 2);
	}
	g.globalAlpha = 1;
	g.globalCompositeOperation = 'source-over';
	// 장비 그림자: 위쪽 천장등을 받아 상판 앞쪽으로 늘어진 어두운 얼룩
	const shadowAt = (x0: number, x1: number, y: number): void => {
		const cx = (x0 + x1) / 2;
		const rx = (x1 - x0) / 2 + 0.02 * G.m;
		const ry = 0.05 * H;
		g.save();
		g.translate(cx, y + ry * 0.6);
		g.scale(1, ry / rx);
		const shade = g.createRadialGradient(0, 0, 0, 0, 0, rx);
		shade.addColorStop(0, 'rgba(0,0,0,0.6)');
		shade.addColorStop(1, 'rgba(0,0,0,0)');
		g.fillStyle = shade;
		g.fillRect(-rx, -rx, rx * 2, rx * 2);
		g.restore();
	};
	shadowAt(Math.max(0, L.laser.x0), L.laser.x1, L.base);
	for (const fx of L.lenses) shadowAt(W * fx - L.lensR, W * fx + L.lensR, L.base);
	shadowAt(L.detector.x0, Math.min(W, L.detector.x1 + L.detector.box), L.base);

	// 가까운 층: 장비 하나하나(들어서는 순서대로 나타난다)
	const pieces: LabPiece[] = [];
	const { r, axisY, base } = L;
	// 레이저 관: 원통 + 받침 + 끝면
	pieces.push(
		labPiece(
			Math.max(-20, L.laser.x0 - 4),
			axisY - r - 6,
			L.laser.x1 - Math.max(-20, L.laser.x0 - 4) + r + 8,
			base - axisY + r + 10,
			[0.02, 0.16],
			(p) => {
				p.fillStyle = '#060505';
				for (const fx of [0.25, 0.75]) {
					const fxPos = lerp(L.laser.x0, L.laser.x1, fx);
					p.beginPath();
					p.moveTo(fxPos - r * 0.9, base);
					p.lineTo(fxPos + r * 0.9, base);
					p.lineTo(fxPos + r * 0.5, axisY + r * 0.6);
					p.lineTo(fxPos - r * 0.5, axisY + r * 0.6);
					p.closePath();
					p.fill();
				}
				horizontalCylinder(p, L.laser.x0, L.laser.x1, axisY, r, {
					top: '#5a4636',
					high: '#2c241e',
					bottom: '#1a222a'
				});
				p.strokeStyle = 'rgba(0,0,0,0.6)';
				p.lineWidth = 1.5;
				for (const fx of [0.12, 0.55, 0.9]) {
					const bx = lerp(L.laser.x0, L.laser.x1, fx);
					p.beginPath();
					p.moveTo(bx, axisY - r);
					p.lineTo(bx, axisY + r);
					p.stroke();
				}
				p.fillStyle = '#181412';
				p.beginPath();
				p.ellipse(L.laser.x1, axisY, r * 0.32, r * 0.98, 0, 0, Math.PI * 2);
				p.fill();
				p.strokeStyle = 'rgba(255,200,150,0.4)';
				p.lineWidth = 1;
				p.stroke();
			}
		)
	);
	// 렌즈 받침대 두 개
	for (const [index, fx] of L.lenses.entries()) {
		const lx = W * fx;
		const R = L.lensR;
		pieces.push(
			labPiece(
				lx - R - 6,
				axisY - R - 6,
				R * 2 + 12,
				base - axisY + R + 12,
				[0.14 + index * 0.08, 0.28 + index * 0.08],
				(p) => {
					p.fillStyle = '#050404';
					p.fillRect(lx - R * 0.7, base - R * 0.35, R * 1.4, R * 0.35);
					p.fillRect(lx - R * 0.12, axisY + R * 0.8, R * 0.24, base - axisY - R * 0.8);
					const ring = (): void => {
						p.beginPath();
						p.arc(lx, axisY, R, 0, Math.PI * 2);
						p.arc(lx, axisY, R * 0.68, 0, Math.PI * 2, true);
					};
					ring();
					p.fillStyle = '#0b0908';
					p.fill('evenodd');
					const rim = p.createLinearGradient(lx - R, axisY - R, lx + R, axisY + R);
					rim.addColorStop(0, 'rgba(255,200,150,0.65)');
					rim.addColorStop(0.45, 'rgba(255,200,150,0)');
					rim.addColorStop(0.7, 'rgba(120,170,220,0)');
					rim.addColorStop(1, 'rgba(120,170,220,0.4)');
					rimLight(p, ring, rim, 1.2);
					// 렌즈 유리: 어두운 푸른빛 + 비스듬한 반사
					const glass = p.createRadialGradient(
						lx - R * 0.2,
						axisY - R * 0.2,
						0,
						lx,
						axisY,
						R * 0.68
					);
					glass.addColorStop(0, 'rgba(90,120,150,0.35)');
					glass.addColorStop(1, 'rgba(20,30,40,0.25)');
					p.fillStyle = glass;
					p.beginPath();
					p.arc(lx, axisY, R * 0.68, 0, Math.PI * 2);
					p.fill();
					p.strokeStyle = 'rgba(235,245,255,0.5)';
					p.lineWidth = 1.2;
					p.beginPath();
					p.arc(lx, axisY, R * 0.5, Math.PI * 1.1, Math.PI * 1.45);
					p.stroke();
				}
			)
		);
	}
	// 원통형 광검출기: 앞면 창 + 골진 몸통 (+ 가로 화면에선 전자 상자)
	const dr = r * 1.35;
	const det = L.detector;
	const detRight = det.x1 + det.box;
	pieces.push(
		labPiece(
			det.x0 - dr * 0.5,
			axisY - dr * 1.6,
			detRight - det.x0 + dr,
			base - axisY + dr * 1.6 + 6,
			[0.3, 0.44],
			(p) => {
				p.fillStyle = '#050404';
				p.beginPath();
				p.moveTo(det.x0 + dr * 0.6, base);
				p.lineTo(det.x0 + dr * 2.2, base);
				p.lineTo(det.x0 + dr * 1.7, axisY + dr * 0.5);
				p.lineTo(det.x0 + dr * 1.1, axisY + dr * 0.5);
				p.closePath();
				p.fill();
				if (det.box > 0) {
					const bx = det.x1 - 4;
					const path = (): void =>
						roundRectPath(p, bx, axisY - dr * 1.5, det.box, base - axisY + dr * 1.5, 4);
					path();
					p.fillStyle = '#0a0807';
					p.fill();
					const rim = p.createLinearGradient(bx, 0, bx + det.box, 0);
					rim.addColorStop(0, 'rgba(255,200,150,0.4)');
					rim.addColorStop(0.3, 'rgba(255,200,150,0)');
					rimLight(p, path, rim, 1.2);
					p.fillStyle = 'rgba(255,170,90,0.8)';
					p.fillRect(bx + det.box * 0.2, axisY - dr * 1.1, 3, 3);
					p.fillStyle = 'rgba(120,255,160,0.8)';
					p.fillRect(bx + det.box * 0.35, axisY - dr * 1.1, 3, 3);
				}
				horizontalCylinder(p, det.x0, det.x1, axisY, dr, {
					top: '#4c4038',
					high: '#262019',
					bottom: '#18202a'
				});
				p.strokeStyle = 'rgba(0,0,0,0.55)';
				p.lineWidth = 1.2;
				for (let i = 1; i <= 7; i++) {
					const rx = det.x0 + dr * 1.2 + i * dr * 0.32;
					p.beginPath();
					p.moveTo(rx, axisY - dr);
					p.lineTo(rx, axisY + dr);
					p.stroke();
				}
				p.fillStyle = '#16120f';
				p.beginPath();
				p.ellipse(det.x0, axisY, dr * 0.3, dr * 0.98, 0, 0, Math.PI * 2);
				p.fill();
				p.strokeStyle = 'rgba(180,220,255,0.5)';
				p.lineWidth = 1;
				p.stroke();
			}
		)
	);
	// 늘어진 케이블
	pieces.push(
		labPiece(-20, axisY - 10, W + 40, h - axisY + 20, [0.4, 0.52], (p) => {
			const cables = [
				[
					det.x0 + dr * 2,
					axisY + dr * 0.7,
					W * 0.8,
					G.tableFront - 0.03 * H,
					W + 20,
					G.tableY + 0.12 * H,
					4.5
				],
				[
					lerp(det.x0, det.x1, 0.7),
					axisY + dr * 0.8,
					W * 0.9,
					G.tableY + 0.17 * H,
					W + 20,
					axisY + 0.03 * H,
					3
				],
				[
					lerp(L.laser.x0, L.laser.x1, 0.4),
					axisY + r,
					W * 0.12,
					G.tableFront - 0.05 * H,
					-20,
					G.tableY + 0.1 * H,
					4
				]
			];
			p.lineCap = 'round';
			for (const [x0, y0, cx, cy, x1, y1, width] of cables) {
				const curve = (): void => {
					p.beginPath();
					p.moveTo(x0, y0);
					p.quadraticCurveTo(cx, cy, x1, y1);
				};
				curve();
				p.strokeStyle = '#030202';
				p.lineWidth = width * G.sizeScale;
				p.stroke();
				p.save();
				p.translate(-0.8, -1);
				curve();
				p.strokeStyle = 'rgba(255,200,150,0.22)';
				p.lineWidth = 0.9;
				p.stroke();
				p.restore();
			}
		})
	);
	return { back, pieces, layout: L, scope };
}

// ───────── 7-1 신호 점 ─────────
export const SIGNAL_COUNT = 520;
export const SIGNAL_FALL = 0.05;
export type Signals = { n: number; dx: Float32Array; landAt: Float32Array };
function buildSignals(): Signals {
	const random = seeded(41);
	const n = SIGNAL_COUNT;
	const dx = new Float32Array(n);
	const landAt = new Float32Array(n);
	for (let k = 0; k < n; k++) {
		dx[k] = gauss(random) * 0.5;
		landAt[k] = 0.06 + 0.88 * Math.pow(k / n, 0.8);
	}
	return { n, dx, landAt };
}
export function signalsLanded(s: number): number {
	if (s <= 0.06) return 0;
	return Math.min(
		SIGNAL_COUNT,
		Math.floor(SIGNAL_COUNT * Math.pow(Math.min(1, (s - 0.06) / 0.88), 1.25)) + 1
	);
}

// ───────── 7-2 불꽃: 뚫린 한 점에서 터진다. 대부분은 터지는 순간, 일부는 뒤이어 잦아들며 나온다 ─────────
export const EMBER_BREAK_S = 1.45;
const EMBER_BURST_SHARE = 0.72;
export type Embers = {
	n: number;
	x0: Float32Array;
	y0: Float32Array;
	vx: Float32Array;
	vy: Float32Array;
	drag: Float32Array;
	start: Float32Array;
	life: Float32Array;
	size: Float32Array;
	bright: Float32Array;
};
function buildEmbers(): Embers {
	const n = G.portrait ? 700 : 1000;
	const random = seeded(77);
	const e: Embers = {
		n,
		x0: new Float32Array(n),
		y0: new Float32Array(n),
		vx: new Float32Array(n),
		vy: new Float32Array(n),
		drag: new Float32Array(n),
		start: new Float32Array(n),
		life: new Float32Array(n),
		size: new Float32Array(n),
		bright: new Float32Array(n)
	};
	const xN = W * 0.5;
	for (let i = 0; i < n; i++) {
		const burst = random() < EMBER_BURST_SHARE;
		e.x0[i] = xN + gauss(random) * G.numSize * 0.06;
		e.y0[i] = G.lineY2 + gauss(random) * 2;
		const angle = -Math.PI / 2 + gauss(random) * (burst ? 0.8 : 0.5);
		const speed = (burst ? 0.3 + Math.pow(random(), 0.7) * 1.25 : 0.12 + random() * 0.35) * H;
		e.vx[i] = Math.cos(angle) * speed;
		e.vy[i] = Math.sin(angle) * speed;
		// 공기 저항을 알갱이마다 다르게: 무거운 불씨는 멀리, 가벼운 재는 금방 멈춰 내려온다
		e.drag[i] = 0.8 + random() * random() * 4;
		e.start[i] =
			EMBER_BREAK_S +
			(burst ? Math.pow(random(), 3) * 0.015 : 0.015 + Math.pow(random(), 2) * 0.22);
		e.life[i] = burst ? 0.35 + Math.pow(random(), 1.5) * 2.2 : 0.3 + random() * 1.1;
		e.size[i] = 0.7 + Math.pow(random(), 2.2) * 2.8;
		e.bright[i] = 0.45 + random() * 0.55;
	}
	return e;
}

// ───────── 창살 문 ─────────
// 빛으로 그린 원형 창살 문: 빛의 고리 + 안쪽의 가는 평행 결. 결 방향 양 끝의 고리 밖에 빛 눈금을 달아
// 기울기가 한눈에 보이게 한다(5장의 네모난 카드와 모양이 겹치지 않게 원형)
export type GateImage = {
	canvas: HTMLCanvasElement;
	w: number;
	h: number;
	gw: number;
	gh: number;
	r: number;
};
function buildGate(angle: number, diameter: number): GateImage {
	const R = diameter / 2;
	const pad = R * 0.7;
	const size = R * 2 + pad * 2;
	const c = makeCanvas(size * dpr, size * dpr);
	const g = context2d(c);
	g.scale(dpr, dpr);
	const o = size / 2;
	g.globalCompositeOperation = 'lighter';
	// 안쪽 면: 아주 옅은 푸른 빛
	const face = g.createRadialGradient(o, o, 0, o, o, R);
	face.addColorStop(0, 'rgba(120,160,255,0.05)');
	face.addColorStop(0.85, 'rgba(150,190,255,0.09)');
	face.addColorStop(1, 'rgba(150,190,255,0)');
	g.fillStyle = face;
	g.beginPath();
	g.arc(o, o, R, 0, Math.PI * 2);
	g.fill();
	// 고리 바깥의 회절 무지개
	for (let k = 0; k < SPECTRUM.length; k++) {
		g.strokeStyle = rgba(SPECTRUM[k], 0.12);
		g.lineWidth = 1.3;
		g.beginPath();
		g.arc(o, o, R + 3 + k * 1.25, 0, Math.PI * 2);
		g.stroke();
	}
	// 빛의 고리: 넓은 번짐 + 밝은 심
	g.strokeStyle = 'rgba(170,205,255,0.12)';
	g.lineWidth = 9;
	g.beginPath();
	g.arc(o, o, R, 0, Math.PI * 2);
	g.stroke();
	g.shadowColor = 'rgba(170,205,255,0.9)';
	g.shadowBlur = 10 * dpr;
	g.strokeStyle = 'rgba(220,236,255,0.85)';
	g.lineWidth = 1.8;
	g.stroke();
	g.shadowBlur = 0;
	// 결
	g.save();
	g.beginPath();
	g.arc(o, o, R - 3, 0, Math.PI * 2);
	g.clip();
	g.translate(o, o);
	g.rotate(angle);
	const spacing = (R * 2) / 11;
	for (let i = -6; i <= 6; i++) {
		const x = i * spacing;
		g.strokeStyle = 'rgba(190,215,255,0.16)';
		g.lineWidth = 2.6;
		g.beginPath();
		g.moveTo(x, -R);
		g.lineTo(x, R);
		g.stroke();
		g.strokeStyle = i === 0 ? 'rgba(240,248,255,0.95)' : 'rgba(225,238,255,0.55)';
		g.lineWidth = i === 0 ? 1.3 : 0.75;
		g.stroke();
	}
	g.restore();
	// 결 방향 눈금(고리 밖 양 끝)
	g.save();
	g.translate(o, o);
	g.rotate(angle);
	g.shadowColor = 'rgba(200,225,255,0.95)';
	g.shadowBlur = 8 * dpr;
	g.strokeStyle = 'rgba(240,248,255,0.95)';
	g.lineWidth = 2.2;
	g.lineCap = 'round';
	for (const sign of [-1, 1]) {
		g.beginPath();
		g.moveTo(0, sign * (R + 5));
		g.lineTo(0, sign * (R + 5 + R * 0.28));
		g.stroke();
	}
	g.restore();
	return { canvas: c, w: size, h: size, gw: R * 2, gh: R * 2, r: R };
}
const GATE_TILT = 0.32; // 1장 두 문의 같은 기울기(라디안)
export type GateImages = {
	pair: GateImage;
	fixed: GateImage;
	up: GateImage;
	down: GateImage;
	upright: GateImage;
};
function buildGates(): GateImages {
	return {
		pair: buildGate(GATE_TILT, G.gateW * 1.25),
		fixed: buildGate(GATE_TILT, G.gateW * 1.6),
		up: buildGate(0.38, 0.16 * G.m + 12),
		down: buildGate(-0.78, 0.16 * G.m + 12),
		// 5장 · 6장: 결이 수직인 문 하나를 돌려 그린다(원형이라 돌려도 모양이 같다)
		upright: buildGate(0, 0.2 * G.m + 14)
	};
}

// ───────── 크기마다 다시 만드는 것(렌더러가 rebuildLayers 로 설정) ─────────
export let bgInk: HTMLCanvasElement;
export let lab: Lab;
export let signals: Signals;
export let embers: Embers;
export let gateImages: GateImages;

export function rebuildLayers(): void {
	bgCache.clear();
	bgInk = buildInk();
	lab = buildLab();
	signals = buildSignals();
	embers = buildEmbers();
	gateImages = buildGates();
}

// ───────── 장별 배경 캐시(2~6장 · 9장) ─────────
const BG_CACHE_LIMIT = 12; // 장별 배경 그림은 최근 것만 들고 있는다(메모리)
const bgCache = new Map<string, HTMLCanvasElement | Piece>();
function remember<T extends HTMLCanvasElement | Piece>(key: string, value: T): T {
	bgCache.set(key, value);
	if (bgCache.size > BG_CACHE_LIMIT) {
		const oldest = bgCache.keys().next();
		if (oldest.done !== true) bgCache.delete(oldest.value);
	}
	return value;
}
// 화면 크기의 미리 그린 배경(장마다 한 번). 키 = 이름 + W×H×DPR
export function layer(
	name: string,
	draw: (g: CanvasRenderingContext2D) => void
): HTMLCanvasElement {
	const key = `${name}|${sizeKey()}`;
	const hit = bgCache.get(key);
	if (hit instanceof HTMLCanvasElement) return hit;
	const c = makeCanvas(W * dpr, H * dpr);
	const g = context2d(c);
	g.scale(dpr, dpr);
	draw(g);
	return remember(key, c);
}
export function piece(
	name: string,
	x: number,
	y: number,
	w: number,
	h: number,
	draw: (g: CanvasRenderingContext2D) => void
): Piece {
	const key = `${name}|${sizeKey()}`;
	const hit = bgCache.get(key);
	if (hit !== undefined && !(hit instanceof HTMLCanvasElement)) return hit;
	return remember(key, makePiece(x, y, w, h, draw));
}
