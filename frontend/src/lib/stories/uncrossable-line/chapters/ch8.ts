// 8장 물결(시제품 flow.src.html 장면 3 :1867-2239). 물통 안 물빛 위로 초음파 물결 줄무늬가 서고(8-1), 빛이 두 갈래 문으로 번갈아 꺾이며(8-2),
// 두 방 사이 12미터를 신호가 기어가는 동안 질문이 네 번 바뀌고(8-3), 1장 구도가 겹치며 선이 갈라진다(8-4).
// 물빛은 WebGL(waveGl.ts), 컨텍스트가 없으면 Canvas 정지 물빛 무늬로 그린다.
import {
	clamp01,
	ctx,
	drawDust,
	drawGate,
	drawGlowText,
	drawSprite,
	drawTwinEdges,
	easeInOut,
	easeOutCubic,
	FONT_STACK,
	G,
	glowSprite,
	H,
	lerp,
	ringSprite,
	rgba,
	smooth,
	SPECTRUM,
	strokePoly,
	W,
	WARM,
	WHITE,
	type DustOptions,
	type Point,
	type Rect
} from '../linePaint.ts';
import { gateImages } from '../lineLayers.ts';
import { drawWaterFallback, renderWater, type WaterState, type WaveGl } from '../waveGl.ts';
import { scene1 } from './ch1.ts';

const STRIPE_CYCLES = 3.5; // 8-2 구간 동안 물결 줄무늬가 섰다 사라지는 횟수
// 8-3: 신호가 12미터를 기어가는 동안 질문(물결)이 네 번 바뀐다
const RELAY_START = 0.3; // 8-3 진행값: 신호 출발
const RELAY_SPAN = 0.65; // 8-3 진행값: 출발부터 도착까지
const RELAY_SWITCHES = 4;
const ROOM_STRIPES = 4; // 두 방 물통 안에 서는 줄무늬 수

// 렌더러가 준비한 WebGL 물결(없으면 null: 정지 물빛 무늬)
let wave: WaveGl | null = null;
export function bindWave(handle: WaveGl | null): void {
	wave = handle;
}

function zoomRect(a: Rect, b: Rect, z: number): Rect {
	return {
		x: lerp(a.x, b.x, z),
		y: lerp(a.y, b.y, z),
		w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), z)),
		h: Math.exp(lerp(Math.log(a.h), Math.log(b.h), z))
	};
}
function stripePhase(s: number): number {
	return (s - 1) * STRIPE_CYCLES * Math.PI * 2 + 0.3;
}
function stripesOn(s: number): number {
	return smooth(-0.25, 0.25, Math.sin(stripePhase(s)));
}
function relaySwitchAt(k: number): number {
	return RELAY_START + (RELAY_SPAN * (k + 0.5)) / RELAY_SWITCHES;
}
function relaySwitches(u: number): number {
	let count = 0;
	for (let k = 0; k < RELAY_SWITCHES; k++) if (u >= relaySwitchAt(k)) count++;
	return count;
}
function relayQuestion(u: number): number {
	// 바뀔 때마다 물결이 섰다(1) 사라졌다(0)를 오간다. 경계는 짧게 섞는다
	let on = 1;
	for (let k = 0; k < RELAY_SWITCHES; k++) {
		const edge = smooth(relaySwitchAt(k) - 0.012, relaySwitchAt(k) + 0.012, u);
		on = lerp(on, 1 - on, edge);
	}
	return on;
}
// 물통 A 가 없는 구간(8-1 · 8-2)은 A 를 1장 물통 자리에 두고 세기 0 으로 그린다
function waterState(s: number, bright: number): WaterState {
	if (s < 1) {
		const z = easeInOut(clamp01(s / 0.36));
		return {
			rectB: zoomRect(G.tank0, G.full, z),
			rectA: G.tankA,
			alphaA: 0,
			wave: smooth(0.42, 0.7, s),
			front: clamp01((s - 0.4) / 0.32),
			stripe: G.stripe,
			bright
		};
	}
	if (s < 2)
		return {
			rectB: G.full,
			rectA: G.tankA,
			alphaA: 0,
			wave: 0.2 + 0.8 * stripesOn(s),
			front: 1,
			stripe: G.stripe,
			bright
		};
	if (s < 3) {
		const z = easeInOut(clamp01((s - 2) / 0.35));
		const u = s - 2;
		return {
			rectB: zoomRect(G.full, G.roomB, z),
			rectA: G.roomA,
			alphaA: smooth(2.15, 2.4, s),
			wave: 0.12 + 0.88 * relayQuestion(u),
			front: 1,
			stripe: lerp(G.stripe, G.roomB.h / ROOM_STRIPES, z),
			bright
		};
	}
	const z = easeInOut(clamp01((s - 3) / 0.35));
	return {
		rectB: zoomRect(G.roomB, G.tankB, z),
		rectA: zoomRect(G.roomA, G.tankA, z),
		alphaA: 1,
		wave: 0.6,
		front: 1,
		stripe: lerp(G.roomB.h, G.tankB.h, z) / ROOM_STRIPES,
		bright
	};
}
function drawFan(S: Point, E: Point, I: number): void {
	if (I <= 0.003) return;
	const dx = E.x - S.x;
	const dy = E.y - S.y;
	const len = Math.hypot(dx, dy);
	const nx = -dy / len;
	const ny = dx / len;
	const spreadEnd = G.m * 0.045;
	ctx.lineCap = 'round';
	for (let j = 0; j < SPECTRUM.length; j++) {
		const off = ((j - 3) / 3) * spreadEnd;
		const ex = E.x + nx * off;
		const ey = E.y + ny * off;
		const grad = ctx.createLinearGradient(S.x, S.y, ex, ey);
		grad.addColorStop(0, rgba(SPECTRUM[j], 0.35));
		grad.addColorStop(0.5, rgba(SPECTRUM[j], 1));
		grad.addColorStop(1, rgba(SPECTRUM[j], 0.75));
		strokePoly([S.x, S.y, ex, ey], 9, grad, 0.06 * I);
		strokePoly([S.x, S.y, ex, ey], 1.8, grad, 0.6 * I);
	}
	const white = ctx.createLinearGradient(S.x, S.y, E.x, E.y);
	white.addColorStop(0, 'rgba(255,250,240,1)');
	white.addColorStop(0.45, 'rgba(255,250,240,0)');
	strokePoly([S.x, S.y, E.x, E.y], 2.4, white, 0.9 * I);
	drawSprite(glowSprite([220, 230, 255]), E.x, E.y, G.m * 0.08, 0.35 * I);
}
function drawBeam(s: number, I: number): void {
	if (I <= 0.003) return;
	const S = G.split;
	const enter = clamp01((s - 1) / 0.14);
	const head = lerp(-0.05 * W, S.x, easeOutCubic(enter));
	const color = 'rgb(255,244,226)';
	const pts = [-0.05 * W, S.y, head, S.y];
	ctx.lineCap = 'round';
	ctx.globalAlpha = Math.min(1, 0.12 * I);
	ctx.drawImage(
		glowSprite([255, 240, 220]),
		-0.05 * W,
		S.y - G.m * 0.07,
		head + 0.05 * W,
		G.m * 0.14
	);
	strokePoly(pts, 16, color, 0.08 * I);
	strokePoly(pts, 5, color, 0.3 * I);
	strokePoly(pts, 1.6, 'rgb(255,255,255)', 0.95 * I);
	const gates = smooth(1.05, 1.25, s) * I;
	if (enter >= 1) {
		const on = stripesOn(s);
		const phase = stripePhase(s);
		const since = (phase - Math.floor(phase / Math.PI) * Math.PI) / (STRIPE_CYCLES * Math.PI * 2);
		const switchFlash = Math.exp(-since / 0.02);
		const upI = I * (0.1 + 0.9 * on);
		const downI = I * (0.1 + 0.9 * (1 - on));
		drawFan(S, G.gateU, upI);
		drawFan(S, G.gateD, downI);
		drawSprite(glowSprite(WARM), S.x, S.y, G.m * 0.16, (0.45 + 0.5 * switchFlash) * I);
		drawSprite(glowSprite(WHITE), S.x, S.y, 7, I);
		drawGate(G.gateU, gateImages.up, gates * (0.35 + 0.5 * upI));
		drawGate(G.gateD, gateImages.down, gates * (0.35 + 0.5 * downI));
	} else {
		drawSprite(glowSprite(WARM), head, S.y, G.m * 0.1, 0.7 * I);
		drawGate(G.gateU, gateImages.up, gates * 0.35);
		drawGate(G.gateD, gateImages.down, gates * 0.35);
	}
}
function drawRelay(s: number, I: number): void {
	// 8-3: 두 방 사이 12미터 위를 기어가는 신호 점과, 질문이 바뀔 때마다 하나씩 켜지는 눈금
	if (I <= 0.003) return;
	const u = s - 2;
	const A = G.roomA;
	const B = G.roomB;
	const dx = B.x - A.x;
	const dy = B.y - A.y;
	const len = Math.hypot(dx, dy);
	const ux = dx / len;
	const uy = dy / len;
	const nx = -uy;
	const ny = ux;
	const inset = Math.hypot(A.w, A.h) * 0.55;
	const P0 = { x: A.x + ux * inset, y: A.y + uy * inset };
	const P1 = { x: B.x - ux * inset, y: B.y - uy * inset };
	ctx.save();
	ctx.setLineDash([3, 6]);
	strokePoly([P0.x, P0.y, P1.x, P1.y], 1, 'rgb(210,235,255)', 0.4 * I);
	ctx.restore();
	const mid = { x: (P0.x + P1.x) / 2, y: (P0.y + P1.y) / 2 };
	const labelSize = Math.round(12 * G.sizeScale);
	ctx.globalAlpha = Math.min(1, 0.7 * I);
	ctx.font = `${labelSize}px ${FONT_STACK}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = 'rgb(210,235,255)';
	ctx.fillText('12 m', mid.x - nx * labelSize * 1.6, mid.y - ny * labelSize * 1.6);
	// 신호 점
	const q = clamp01((u - RELAY_START) / RELAY_SPAN);
	const x = lerp(P0.x, P1.x, q);
	const y = lerp(P0.y, P1.y, q);
	const tail = Math.max(0, q - 0.12);
	const trail = ctx.createLinearGradient(lerp(P0.x, P1.x, tail), lerp(P0.y, P1.y, tail), x, y);
	trail.addColorStop(0, 'rgba(255,226,190,0)');
	trail.addColorStop(1, 'rgba(255,226,190,1)');
	strokePoly([lerp(P0.x, P1.x, tail), lerp(P0.y, P1.y, tail), x, y], 2, trail, 0.8 * I);
	drawSprite(glowSprite([255, 210, 150]), x, y, G.m * 0.05, 0.7 * I);
	drawSprite(glowSprite(WHITE), x, y, 3.5, I);
	// 눈금 네 개: 경로 옆에 나란히, 바뀐 횟수만큼 켜진다
	const count = relaySwitches(u);
	const spacing = 15 * G.sizeScale;
	const tickLen = 10 * G.sizeScale;
	const base = { x: mid.x + nx * labelSize * 2.6, y: mid.y + ny * labelSize * 2.6 };
	for (let k = 0; k < RELAY_SWITCHES; k++) {
		const offset = (k - (RELAY_SWITCHES - 1) / 2) * spacing;
		const tx = base.x + ux * offset;
		const ty = base.y + uy * offset;
		const lit = k < count;
		const fresh = lit ? Math.exp(-(u - relaySwitchAt(k)) / 0.03) : 0;
		strokePoly(
			[
				tx - (nx * tickLen) / 2,
				ty - (ny * tickLen) / 2,
				tx + (nx * tickLen) / 2,
				ty + (ny * tickLen) / 2
			],
			lit ? 2 : 1,
			lit ? 'rgb(160,240,255)' : 'rgb(160,200,220)',
			(lit ? 0.95 : 0.25) * I
		);
		if (lit)
			drawSprite(glowSprite([120, 220, 255]), tx, ty, 10 + 10 * fresh, (0.35 + 0.5 * fresh) * I);
	}
	if (count > 0) {
		const size = 0.075 * G.m;
		drawGlowText(
			String(count),
			base.x + ux * (spacing * 2.4 + size * 0.5) + nx * size * 0.15,
			base.y + uy * (spacing * 2.4 + size * 0.5) + ny * size * 0.15,
			size,
			{ core: 'rgb(225,248,255)', glow: 'rgba(90,200,255,0.9)' },
			0.9 * I
		);
	}
	// 질문이 바뀌는 순간 두 방의 물통이 함께 반짝인다
	for (let k = 0; k < count; k++) {
		const flash = Math.exp(-(u - relaySwitchAt(k)) / 0.025);
		if (flash < 0.02) continue;
		drawSprite(
			ringSprite([150, 230, 255]),
			A.x,
			A.y,
			A.w * (0.7 + 0.4 * (1 - flash)),
			0.5 * flash * I
		);
		drawSprite(
			ringSprite([150, 230, 255]),
			B.x,
			B.y,
			B.w * (0.7 + 0.4 * (1 - flash)),
			0.5 * flash * I
		);
	}
}
export function scene3(s: number, local: number, t: number, fade: number): void {
	const w = waterState(s, fade);
	if (wave !== null) {
		ctx.clearRect(0, 0, W, H);
		renderWater(wave, w, t);
	} else {
		drawWaterFallback(w);
	}
	ctx.globalCompositeOperation = 'lighter';
	const inside = s < 2 ? smooth(0.12, 0.36, s) : 1 - smooth(2.05, 2.3, s);
	const S = G.split;
	const beamI = s >= 1 ? 1 - smooth(2.0, 2.3, s) : 0;
	const waterLights = [{ x: S.x, y: S.y, I: beamI * 0.9, R2: Math.pow(G.m * 0.3, 2) }];
	const dustOptions: DustOptions = {
		tint: 'water',
		vis: inside * 0.75 * fade,
		drift: 0.2,
		scroll: local,
		lights: waterLights,
		laser: null,
		glint: 0,
		t,
		ambient: 0.3
	};
	drawDust(dustOptions, 0);
	drawDust(dustOptions, 1);
	// 아래쪽 진동자에서 들어오는 초음파의 빛
	const ultrasound = smooth(0.38, 0.5, s) * (1 - smooth(2.0, 2.2, s)) * fade;
	if (ultrasound > 0.003) {
		ctx.globalAlpha = Math.min(1, ultrasound * 0.45 * (0.85 + 0.15 * Math.sin(t * 9)));
		ctx.drawImage(glowSprite([110, 215, 255]), -W * 0.2, H - G.m * 0.06, W * 1.4, G.m * 0.12);
	}
	drawBeam(s, beamI * fade);
	drawDust(dustOptions, 2);
	if (s >= 2 && s < 3.3) drawRelay(s, smooth(2.3, 2.45, s) * (1 - smooth(3.0, 3.25, s)) * fade);
	if (s >= 3) {
		const overlayAlpha = smooth(3.15, 3.45, s) * fade;
		if (overlayAlpha > 0.003) {
			scene1(4.95, local, t, {
				alpha: overlayAlpha,
				crack: smooth(3.45, 3.85, s),
				n84: smooth(3.38, 3.6, s) * fade,
				tankInterior: wave !== null
			});
		}
	}
	// 쌍둥이 빛: 8-4 에서 1장 구도가 겹칠 때 다시 밝아진다
	ctx.globalCompositeOperation = 'lighter';
	drawTwinEdges(t, smooth(3.15, 3.5, s) * fade, fade);
}
