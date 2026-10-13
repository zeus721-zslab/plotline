// 4장 장갑 상자(시제품 flow.src.html :3174-3616): 우주 · 지구 가장자리의 장갑 상자 · 쌓이는 계산 종이 · 빈 책상과 칠판의 빛 상자.
// 성능(STEP 125): 4장 레이어(우주 · 지구 · 칠판) · 장갑/종이 스프라이트 · '?' 글자는 3장 후반에 유휴 시간에 미리 만든다(prewarmChapter4).
// 4-1 리본은 끝점이 고정이라 그라디언트를 W×H×DPR 키로 캐시한다. 그리는 결과는 시제품과 같다.
import {
	cached,
	clamp01,
	COLOR_A,
	COLOR_B,
	context2d,
	ctx,
	dotSprite,
	dpr,
	drawBeats,
	drawDust,
	drawGlowText,
	drawLight,
	drawRibbon,
	drawSprite,
	drawTwinEdges,
	dustLayers,
	easeInOut,
	easeOutCubic,
	FONT_STACK,
	G,
	gauss,
	glowLine,
	glowSprite,
	H,
	hash,
	lerp,
	makeCanvas,
	PALETTE_GOLD,
	paintLayer,
	REDUCED,
	rgba,
	ringSprite,
	seeded,
	smooth,
	strokePoly,
	vignetteOn,
	W,
	WARM,
	warmGlowText,
	circlePoints,
	type DustOptions,
	type Rgb
} from '../linePaint.ts';
import { layer } from '../lineLayers.ts';
import { officeLayer, officeLayout } from './ch2.ts';

function spaceLayer(): HTMLCanvasElement {
	return layer('space', (g) => {
		g.fillStyle = '#05060a';
		g.fillRect(0, 0, W, H);
		const random = seeded(33);
		g.globalCompositeOperation = 'lighter';
		const nebula: Rgb[] = [
			[40, 60, 120],
			[80, 40, 110],
			[30, 80, 110]
		];
		for (let i = 0; i < 7; i++) {
			const x = random() * W;
			const y = random() * H * 0.8;
			const r = (0.3 + random() * 0.4) * G.diag;
			const grad = g.createRadialGradient(x, y, 0, x, y, r);
			grad.addColorStop(0, rgba(nebula[i % 3], (0.08 + random() * 0.07).toFixed(3)));
			grad.addColorStop(1, rgba(nebula[i % 3], 0));
			g.fillStyle = grad;
			g.fillRect(0, 0, W, H);
		}
		for (let i = 0; i < 420; i++) {
			const x = random() * W;
			const y = random() * H;
			const b = random();
			const size = b > 0.9 ? 1.6 : 1;
			g.fillStyle = `rgba(220,230,255,${(0.12 + b * b * 0.7).toFixed(2)})`;
			g.fillRect(x, y, size, size);
			if (b > 0.97) {
				g.globalAlpha = 0.5;
				g.drawImage(glowSprite([200, 215, 255]), x - 6, y - 6, 12, 12);
				g.globalAlpha = 1;
			}
		}
		g.globalCompositeOperation = 'source-over';
		vignetteOn(g, W / 2, H * 0.45, 0.6);
	});
}
type Earth = { cx: number; cy: number; R: number; limbY: number };
function earthGeometry(): Earth {
	const R = Math.max(W, H) * 1.05;
	const limbY = (G.portrait ? 0.56 : 0.6) * H;
	return { cx: W / 2, cy: limbY + R, R, limbY };
}
function earthLayer(): HTMLCanvasElement {
	return layer('earth', (g) => {
		const E = earthGeometry();
		g.drawImage(spaceLayer(), 0, 0, W, H);
		g.globalCompositeOperation = 'lighter';
		const atmo = g.createRadialGradient(E.cx, E.cy, E.R * 0.985, E.cx, E.cy, E.R * 1.07);
		atmo.addColorStop(0, 'rgba(90,160,255,0)');
		atmo.addColorStop(0.2, 'rgba(100,170,255,0.4)');
		atmo.addColorStop(0.4, 'rgba(120,190,255,0.12)');
		atmo.addColorStop(1, 'rgba(90,160,255,0)');
		g.fillStyle = atmo;
		g.fillRect(0, 0, W, H);
		g.globalCompositeOperation = 'source-over';
		const body = g.createLinearGradient(0, E.limbY, 0, H);
		body.addColorStop(0, '#0e2038');
		body.addColorStop(0.3, '#061020');
		body.addColorStop(1, '#02040a');
		g.beginPath();
		g.arc(E.cx, E.cy, E.R, 0, Math.PI * 2);
		g.fillStyle = body;
		g.fill();
		// 밤 쪽 도시 불빛
		g.globalCompositeOperation = 'lighter';
		const random = seeded(47);
		for (let c = 0; c < 26; c++) {
			const phi = (random() - 0.5) * 1.1;
			const depth = random() * 0.22 * H;
			for (let i = 0; i < 18; i++) {
				const ph = phi + gauss(random) * 0.012;
				const d = depth + gauss(random) * 0.008 * H;
				const x = E.cx + (E.R - d) * Math.sin(ph);
				const y = E.cy - (E.R - d) * Math.cos(ph);
				g.fillStyle = `rgba(255,200,130,${(0.15 + random() * 0.45).toFixed(2)})`;
				g.fillRect(x, y, 1.2, 1.2);
			}
		}
		g.strokeStyle = 'rgba(170,215,255,0.65)';
		g.lineWidth = 1.2;
		g.beginPath();
		g.arc(E.cx, E.cy, E.R, Math.PI * 1.2, Math.PI * 1.8);
		g.stroke();
		g.globalCompositeOperation = 'source-over';
	});
}
function addRoundRect(path: Path2D, x: number, y: number, w: number, h: number, r: number): void {
	path.moveTo(x + r, y);
	path.arcTo(x + w, y, x + w, y + h, r);
	path.arcTo(x + w, y + h, x, y + h, r);
	path.arcTo(x, y + h, x, y, r);
	path.arcTo(x, y, x + w, y, r);
	path.closePath();
}
// 빛나는 장갑 실루엣(오른짝 기준, mirror 면 왼짝)
function gloveSprite(mirror: boolean, color: Rgb): HTMLCanvasElement {
	const size = Math.round(G.m * 0.2 + 20);
	return cached(`glove${mirror}|${color}|${size}|${dpr}`, () => {
		const c = makeCanvas(size * dpr, size * dpr);
		const g = context2d(c);
		g.scale(dpr, dpr);
		g.translate(size / 2, size / 2);
		if (mirror) g.scale(-1, 1);
		const u = size / 2.8;
		const hand = new Path2D();
		addRoundRect(hand, -u * 0.46, -u * 0.12, u * 0.92, u * 0.95, u * 0.26);
		const fingers = [
			[-0.42, 0.62],
			[-0.2, 0.78],
			[0.03, 0.74],
			[0.25, 0.6]
		];
		for (const [fx, len] of fingers)
			addRoundRect(hand, u * fx, -u * (0.08 + len), u * 0.19, u * len + u * 0.1, u * 0.09);
		hand.ellipse(-u * 0.55, u * 0.2, u * 0.13, u * 0.36, -0.55, 0, Math.PI * 2);
		addRoundRect(hand, -u * 0.5, u * 0.78, u * 1.0, u * 0.3, u * 0.06);
		const fill = g.createLinearGradient(0, -u, 0, u);
		fill.addColorStop(0, 'rgba(255,252,245,0.95)');
		fill.addColorStop(1, rgba(color, 0.75));
		g.shadowColor = rgba(color, 0.95);
		g.shadowBlur = 16 * dpr;
		g.fillStyle = fill;
		g.fill(hand);
		g.shadowBlur = 0;
		g.globalCompositeOperation = 'destination-out';
		g.fillStyle = 'rgba(0,0,0,0.45)';
		for (const [fx, len] of fingers)
			g.fillRect(u * fx + u * 0.19, -u * (0.08 + len) + u * 0.12, 1, u * len * 0.7);
		g.globalCompositeOperation = 'source-over';
		return c;
	});
}
function drawGloveBox(
	x: number,
	y: number,
	angle: number,
	size: number,
	open: number,
	glove: number,
	color: Rgb,
	mirror: boolean,
	I: number
): void {
	if (I <= 0.003) return;
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(angle);
	ctx.globalCompositeOperation = 'lighter';
	if (glove > 0.003) {
		const sprite = gloveSprite(mirror, color);
		const S = sprite.width / dpr;
		const rise = size * 0.35 + glove * size * 1.1;
		drawSprite(glowSprite(color), 0, -rise, S * 0.95, 0.35 * glove * I);
		ctx.globalAlpha = Math.min(1, glove * I);
		ctx.drawImage(sprite, -S / 2, -rise - S / 2, S, S);
	}
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = Math.min(1, I);
	const h = size * 0.8;
	const fill = ctx.createLinearGradient(0, -h, 0, 0);
	fill.addColorStop(0, '#2e241a');
	fill.addColorStop(1, '#0c0907');
	ctx.fillStyle = fill;
	ctx.fillRect(-size / 2, -h, size, h);
	ctx.globalCompositeOperation = 'lighter';
	glowLine([-size / 2, -h, -size / 2, 0, size / 2, 0, size / 2, -h], 0.9, [255, 206, 150], 0.7 * I);
	if (open > 0.003) drawSprite(glowSprite(color), 0, -h, size * 1.3, 0.45 * open * I);
	// 뚜껑: 왼쪽 위 모서리를 축으로 열린다
	ctx.save();
	ctx.translate(-size / 2, -h);
	ctx.rotate(-open * 1.9);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = Math.min(1, I);
	ctx.fillStyle = '#241b13';
	ctx.fillRect(0, -size * 0.08, size, size * 0.08);
	ctx.globalCompositeOperation = 'lighter';
	glowLine([0, 0, 0, -size * 0.08, size, -size * 0.08, size, 0], 0.9, [255, 214, 160], 0.75 * I);
	ctx.restore();
	ctx.restore();
}
function glovesState(p: number): { E: Earth; phi: number; size: number } {
	const E = earthGeometry();
	const travel = easeInOut(clamp01(p / 0.45));
	const maxPhi = Math.asin(Math.min(0.38 * W, E.R * 0.9) / E.R);
	const phi = lerp(0.015, maxPhi * 0.9, travel);
	return { E, phi, size: G.m * 0.09 + 10 };
}
function drawGloves(p: number, I: number): void {
	const { E, phi, size } = glovesState(p);
	for (const side of [-1, 1]) {
		const a = side * phi;
		const x = E.cx + E.R * Math.sin(a);
		const y = E.cy - E.R * Math.cos(a);
		const left = side < 0;
		const open = left ? smooth(0.48, 0.6, p) : smooth(0.62, 0.74, p);
		const glove = left ? smooth(0.52, 0.7, p) : smooth(0.66, 0.84, p);
		drawGloveBox(x, y, a, size, open, glove, left ? COLOR_A : COLOR_B, left, I);
	}
}
// 4-1 리본 그라디언트 캐시 이름(끝점 G.C → G.A · G.B 고정)
const RIBBON_CACHE_A = 'gloves41A';
const RIBBON_CACHE_B = 'gloves41B';
function gloves41(p: number, t: number, I: number): void {
	// 4-1: 가장자리에 멈춰 있던 1장의 두 빛이 다시 밝아진다(한 원자에서 태어난 짝)
	if (I <= 0.003) return;
	ctx.globalCompositeOperation = 'lighter';
	const wake = smooth(0.08, 0.45, p);
	const lightI = (0.35 + 0.65 * wake) * I * (REDUCED ? 1 : 1 + 0.08 * Math.sin(t * 2.3));
	drawRibbon(G.C.x, G.C.y, G.A.x, G.A.y, 0.55 * lightI, COLOR_A, 1, 1, RIBBON_CACHE_A);
	drawRibbon(G.C.x, G.C.y, G.B.x, G.B.y, 0.55 * lightI, COLOR_B, 1, 2, RIBBON_CACHE_B);
	drawLight(G.A.x, G.A.y, lightI, COLOR_A, null);
	drawLight(G.B.x, G.B.y, lightI, COLOR_B, null);
	drawSprite(glowSprite(WARM), G.C.x, G.C.y, G.m * 0.08, 0.3 * I);
	const ring = smooth(0.08, 0.5, p);
	if (ring > 0 && ring < 1) {
		drawSprite(ringSprite([220, 235, 255]), G.A.x, G.A.y, ring * G.m * 0.5, (1 - ring) * 0.4 * I);
		drawSprite(ringSprite([220, 235, 255]), G.B.x, G.B.y, ring * G.m * 0.5, (1 - ring) * 0.4 * I);
	}
}
function gloves42(p: number, t: number, I: number): void {
	// 4-2: 두 상자가 지구 가장자리를 따라 멀어지고, 하나에선 왼짝 · 다른 하나에선 오른짝
	paintLayer(earthLayer(), I);
	drawGloves(p, I);
}
const PAPER_COUNT = 64;
const PAPER_VARIANTS = 3;
const PAPER_FORMULAS = ['ψ(x,t)', '∫ dx', 'ħ ω', '∂ψ/∂t', '⟨ψ|φ⟩', 'Σ cₙ', 'e^{iθ}', 'Δx Δp'];
const papers = (() => {
	const random = seeded(88);
	const n = PAPER_COUNT;
	const p = {
		fx: new Float32Array(n),
		fy: new Float32Array(n),
		rot: new Float32Array(n),
		at: new Float32Array(n),
		variant: new Uint8Array(n)
	};
	for (let i = 0; i < n; i++) {
		p.fx[i] = gauss(random) * 0.55;
		p.fy[i] = gauss(random) * 0.45;
		p.rot[i] = (random() - 0.5) * 0.9;
		p.at[i] = 0.06 + 0.7 * Math.pow(i / n, 0.85);
		p.variant[i] = Math.floor(random() * PAPER_VARIANTS);
	}
	return p;
})();
function paperSprite(variant: number): HTMLCanvasElement {
	const pw = Math.round(G.m * 0.2 + 16);
	return cached(`paper${variant}|${pw}|${dpr}`, () => {
		const ph = pw * 1.3;
		const c = makeCanvas(pw * dpr, ph * dpr);
		const g = context2d(c);
		g.scale(dpr, dpr);
		const fill = g.createLinearGradient(0, 0, pw, ph);
		fill.addColorStop(0, '#8e816c');
		fill.addColorStop(1, '#6b604f');
		g.fillStyle = fill;
		g.fillRect(0, 0, pw, ph);
		g.fillStyle = 'rgba(255,240,215,0.35)';
		g.fillRect(0, 0, pw, 1);
		const random = seeded(301 + variant);
		g.fillStyle = 'rgba(30,22,16,0.55)';
		g.strokeStyle = 'rgba(30,22,16,0.45)';
		g.font = `${Math.max(7, Math.round(pw * 0.08))}px ${FONT_STACK}`;
		g.textBaseline = 'middle';
		for (let row = 0; row < 11; row++) {
			const y = ph * (0.1 + row * 0.08);
			let x = pw * 0.08;
			while (x < pw * 0.88) {
				if (random() < 0.3) {
					const text = PAPER_FORMULAS[Math.floor(random() * PAPER_FORMULAS.length)];
					g.fillText(text, x, y);
					x += g.measureText(text).width + pw * 0.04;
				} else {
					const len = pw * (0.04 + random() * 0.12);
					g.lineWidth = 0.7;
					g.beginPath();
					g.moveTo(x, y + (random() - 0.5) * 2);
					g.lineTo(x + len, y + (random() - 0.5) * 2);
					g.stroke();
					x += len + pw * 0.03;
				}
			}
		}
		return c;
	});
}
function questionSize(): number {
	return G.m * 0.32;
}
function gloves43(p: number, t: number, I: number): void {
	// 4-3: 장갑과 상자가 흐려지고, 계산 종이가 쌓이며 물음표 하나가 그 아래 묻혀 어두워진다
	if (I <= 0.003) return;
	const fadeOut = 1 - smooth(0, 0.25, p);
	if (fadeOut > 0.003) {
		paintLayer(earthLayer(), fadeOut * I);
		drawGloves(1, fadeOut * I * 0.8);
	}
	const center = { x: W / 2, y: (G.portrait ? 0.34 : 0.38) * H };
	ctx.globalCompositeOperation = 'lighter';
	drawSprite(glowSprite([255, 230, 200]), center.x, center.y - 0.25 * H, G.m * 0.7, 0.1 * I);
	const qDim = 1 - 0.85 * smooth(0.25, 0.85, p);
	drawGlowText('?', center.x, center.y, questionSize(), PALETTE_GOLD, qDim * I);
	ctx.globalCompositeOperation = 'source-over';
	for (let k = 0; k < PAPER_COUNT; k++) {
		const f = clamp01((p - papers.at[k]) / 0.12);
		if (f <= 0) continue;
		const sprite = paperSprite(papers.variant[k]);
		const pw = sprite.width / dpr;
		const ph = sprite.height / dpr;
		const e = easeOutCubic(f);
		const x = center.x + papers.fx[k] * G.m * 0.42;
		const ty = center.y + papers.fy[k] * G.m * 0.25;
		const y = lerp(-0.25 * H, ty, e);
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(papers.rot[k] + (1 - e) * 1.4);
		ctx.globalAlpha = Math.min(1, I * 0.92);
		ctx.drawImage(sprite, -pw / 2, -ph / 2, pw, ph);
		ctx.restore();
	}
	// 위에서 비추는 램프 빛과 가장자리 어둠
	ctx.globalCompositeOperation = 'lighter';
	drawSprite(glowSprite([255, 220, 170]), center.x, center.y - 0.1 * H, G.m * 0.6, 0.12 * I);
}
const SETTLE_COUNT = 90;
const settle = (() => {
	const random = seeded(97);
	const s = {
		x: new Float32Array(SETTLE_COUNT),
		y0: new Float32Array(SETTLE_COUNT),
		land: new Float32Array(SETTLE_COUNT),
		delay: new Float32Array(SETTLE_COUNT),
		size: new Float32Array(SETTLE_COUNT),
		sway: new Float32Array(SETTLE_COUNT)
	};
	for (let i = 0; i < SETTLE_COUNT; i++) {
		s.x[i] = 0.08 + random() * 0.84;
		s.y0[i] = -0.1 + random() * 0.5;
		s.land[i] = random();
		s.delay[i] = random() * 0.25;
		s.size[i] = 1 + random() * 2.2;
		s.sway[i] = random() * Math.PI * 2;
	}
	return s;
})();
// 분필: 같은 선을 조금씩 어긋나게 여러 번 긋고, 바깥에 옅은 발광(4-4 · 5장)
export const CHALK: Rgb = [236, 246, 236];
export function chalkStroke(
	points: number[],
	width: number,
	color: Rgb,
	alpha: number,
	seed: number
): void {
	if (alpha <= 0.003 || points.length < 4) return;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	strokePoly(points, width * 5, rgba(color, 1), 0.05 * alpha);
	for (let k = 0; k < 3; k++) {
		const ox = (hash(seed + k * 3.1) - 0.5) * width * 0.9;
		const oy = (hash(seed + k * 5.7) - 0.5) * width * 0.9;
		const shifted = points.map((v, i) => v + (i % 2 === 0 ? ox : oy));
		strokePoly(shifted, width * (0.6 + 0.3 * k), rgba(color, 1), (0.36 - k * 0.08) * alpha);
	}
}
export function chalkDust(hx: number, hy: number, I: number): void {
	if (I <= 0.003) return;
	const dot = dotSprite(CHALK);
	const seed = Math.floor(hx / 3) + Math.floor(hy / 3) * 7;
	const fallMax = G.m * 0.06;
	for (let k = 0; k < 24; k++) {
		const fall = hash(seed + k) * fallMax;
		const x = hx + (hash(seed + k * 1.3) - 0.5) * G.m * 0.03;
		drawSprite(dot, x, hy + fall, 1.2 + hash(seed + k * 2.1) * 1.6, I * (1 - fall / fallMax) * 0.8);
	}
}
export function boardLayer(): HTMLCanvasElement {
	return layer('board', (g) => {
		const base = g.createLinearGradient(0, 0, 0, H);
		base.addColorStop(0, '#13312a');
		base.addColorStop(1, '#0a1f1a');
		g.fillStyle = base;
		g.fillRect(0, 0, W, H);
		const random = seeded(91);
		// 지우개 자국
		for (let i = 0; i < 26; i++) {
			const x = random() * W;
			const y = random() * H;
			const rx = (0.15 + random() * 0.35) * G.m;
			const squash = 0.25 + random() * 0.35;
			g.save();
			g.translate(x, y);
			g.scale(1, squash);
			const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
			grad.addColorStop(0, `rgba(220,240,230,${(0.025 + random() * 0.035).toFixed(3)})`);
			grad.addColorStop(1, 'rgba(220,240,230,0)');
			g.fillStyle = grad;
			g.fillRect(-rx, -rx, rx * 2, rx * 2);
			g.restore();
		}
		for (let i = 0; i < 2600; i++) {
			g.fillStyle = `rgba(230,245,235,${(random() * 0.06).toFixed(3)})`;
			g.fillRect(random() * W, random() * H, 1, 1);
		}
		// 지워진 옛 글씨의 흔적
		g.strokeStyle = 'rgba(220,240,230,0.04)';
		g.lineWidth = 2;
		for (let i = 0; i < 16; i++) {
			const x = random() * W;
			const y = random() * H;
			g.beginPath();
			g.moveTo(x, y);
			for (let k = 1; k < 7; k++) g.lineTo(x + k * 12 + random() * 8, y + (random() - 0.5) * 10);
			g.stroke();
		}
		const lamp = g.createRadialGradient(W * 0.5, -H * 0.1, 0, W * 0.5, -H * 0.1, G.diag * 0.8);
		lamp.addColorStop(0, 'rgba(255,230,190,0.1)');
		lamp.addColorStop(1, 'rgba(255,230,190,0)');
		g.fillStyle = lamp;
		g.fillRect(0, 0, W, H);
		vignetteOn(g, W / 2, H * 0.4, 0.7);
		const trayY = H * 0.9;
		g.fillStyle = '#1a120c';
		g.fillRect(0, trayY, W, H - trayY);
		g.fillStyle = 'rgba(255,214,170,0.2)';
		g.fillRect(0, trayY, W, 1);
	});
}
function drawChalkLightBox(cx: number, cy: number, b: number, I: number): void {
	// 칠판에 남은 빛 상자 그림: 상자 · 시계 · 작은 문 · 빠져나가는 빛 한 알
	if (I <= 0.003) return;
	const dx = b * 0.32;
	const dy = b * 0.22;
	const x0 = cx - b / 2;
	const y0 = cy - b / 2;
	chalkStroke([x0, y0, x0 + b, y0, x0 + b, y0 + b, x0, y0 + b, x0, y0], 1.6, CHALK, I, 1);
	chalkStroke(
		[x0, y0, x0 + dx, y0 - dy, x0 + b + dx, y0 - dy, x0 + b + dx, y0 + b - dy, x0 + b, y0 + b],
		1.4,
		CHALK,
		I * 0.8,
		2
	);
	chalkStroke([x0 + b, y0, x0 + b + dx, y0 - dy], 1.4, CHALK, I * 0.8, 3);
	chalkStroke(circlePoints(cx, y0 + b * 0.47, b * 0.28, 36), 1.4, CHALK, I, 4);
	chalkStroke(
		[cx, y0 + b * 0.47, cx, y0 + b * 0.27, cx, y0 + b * 0.47, cx + b * 0.14, y0 + b * 0.52],
		1.3,
		CHALK,
		I,
		5
	);
	const door = { x: x0 + b + dx * 0.5, y: y0 + b * 0.62 - dy * 0.5 };
	chalkStroke(
		[
			door.x - dx * 0.2,
			door.y - b * 0.1,
			door.x + dx * 0.2,
			door.y - b * 0.12,
			door.x + dx * 0.2,
			door.y + b * 0.06,
			door.x - dx * 0.2,
			door.y + b * 0.08,
			door.x - dx * 0.2,
			door.y - b * 0.1
		],
		1.2,
		CHALK,
		I * 0.9,
		6
	);
	const arc: number[] = [];
	for (let i = 0; i <= 14; i++) {
		const u = i / 14;
		arc.push(door.x + u * b * 0.9, door.y - Math.sin(u * Math.PI * 0.8) * b * 0.5);
	}
	chalkStroke(arc, 1.1, CHALK, I * 0.7, 7);
	drawSprite(glowSprite([230, 255, 240]), arc[arc.length - 2], arc[arc.length - 1], 9, 0.8 * I);
}
function gloves44(p: number, t: number, I: number): void {
	// 4-4: 빈 책상 위로 빛 먼지가 내려앉고, 이어 칠판에 빛 상자 그림이 희미하게 남는다
	if (I <= 0.003) return;
	const L = officeLayout();
	const board = smooth(0.5, 0.68, p);
	const desk = (1 - board) * I;
	if (desk > 0.003) {
		paintLayer(officeLayer(), desk);
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 0.6 * desk;
		ctx.fillStyle = 'rgb(6,8,14)';
		ctx.fillRect(0, 0, W, H);
		ctx.globalCompositeOperation = 'lighter';
		const dot = glowSprite([220, 230, 255]);
		const core = dotSprite([240, 245, 255]);
		for (let i = 0; i < SETTLE_COUNT; i++) {
			const f = easeOutCubic(clamp01((p - settle.delay[i]) / 0.42));
			const x = settle.x[i] * W + (REDUCED ? 0 : Math.sin(t * 0.6 + settle.sway[i]) * 4 * (1 - f));
			const landY = L.deskY + settle.land[i] * 0.12 * H;
			const y = lerp(settle.y0[i] * H, landY, f);
			const a = desk * (0.35 + 0.4 * f);
			drawSprite(dot, x, y, settle.size[i] * 4, a * 0.35);
			drawSprite(core, x, y, settle.size[i] * 1.5, a);
		}
	}
	if (board > 0.003) {
		paintLayer(boardLayer(), board * I);
		ctx.globalCompositeOperation = 'lighter';
		drawChalkLightBox(
			W / 2,
			(G.portrait ? 0.32 : 0.34) * H,
			G.m * 0.26 + 10,
			0.55 * smooth(0.6, 0.9, p) * I
		);
	}
}
export function chapter4(s: number, local: number, t: number): void {
	paintLayer(spaceLayer(), 1);
	ctx.globalCompositeOperation = 'lighter';
	const dustOptions: DustOptions = {
		tint: 'cool',
		vis: 0.7,
		drift: 0.15 * s,
		scroll: local,
		lights: [
			{ x: G.A.x, y: G.A.y, I: 0.6, R2: Math.pow(G.m * 0.25, 2) },
			{ x: G.B.x, y: G.B.y, I: 0.6, R2: Math.pow(G.m * 0.25, 2) }
		],
		laser: null,
		glint: 0,
		t,
		ambient: 0.12
	};
	dustLayers(dustOptions, 0, 1);
	drawBeats([gloves41, gloves42, gloves43, gloves44], s, t, local);
	drawTwinEdges(t, smooth(0.05, 0.4, s) * (1 - smooth(0.9, 1.2, s)));
	drawDust(dustOptions, 2);
}

/** 4장에 들어가기 전에 미리 만들 것(한 번에 하나씩 유휴 시간에): 레이어 · 장갑/종이 스프라이트 · '?' 빛 글자 */
export function chapter4PrewarmTasks(): (() => void)[] {
	return [
		() => spaceLayer(),
		() => earthLayer(),
		() => boardLayer(),
		() => gloveSprite(true, COLOR_A),
		() => gloveSprite(false, COLOR_B),
		...Array.from({ length: PAPER_VARIANTS }, (_, variant) => () => paperSprite(variant)),
		() => warmGlowText('?', questionSize(), PALETTE_GOLD, dpr)
	];
}
