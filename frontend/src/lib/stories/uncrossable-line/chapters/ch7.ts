// 7장 넘어선 숫자(시제품 flow.src.html 장면 2 :1521-1865). 실험실에 장비가 들어서고 신호가 쌓이며 점수가 84 로 모이고(7-1),
// 84 가 붉은 선 75 를 밀어 휘게 하다 불꽃과 함께 뚫는다(7-2). 7-3 은 양자역학 예측 표식, 7-4 는 어두워진 장면 위 고정된 문과 엿보는 빛.
import {
	clamp01,
	COLOR_A,
	COLOR_B,
	ctx,
	dpr,
	drawDust,
	drawGate,
	drawGlowText,
	drawLaser,
	drawLight,
	drawSprite,
	drawTwinEdges,
	easeInOut,
	easeOutCubic,
	emberSprite,
	FONT_STACK,
	G,
	glowSprite,
	H,
	hash,
	laserPasses,
	lerp,
	MARKS,
	PALETTE_GOLD,
	PALETTE_RED,
	RED,
	REDUCED,
	rgba,
	smooth,
	strokePoly,
	W,
	WARM,
	WHITE,
	type Point,
	type Rgb
} from '../linePaint.ts';
import {
	EMBER_BREAK_S,
	embers,
	gateImages,
	lab,
	LAB_EXTRA,
	SIGNAL_COUNT,
	SIGNAL_FALL,
	signals,
	signalsLanded
} from '../lineLayers.ts';

const SHAKE_MS = 260; // 뚫린 직후 화면이 미세하게 흔들리는 시간
const SHAKE_PX = 4.5;
const QM_LABEL = '양자역학 예측';
const SECONDS_PER_S = 5; // 불씨 물리: 장면 진행 1 = 5초로 환산
const MILLISECONDS_PER_SECOND = 1000;
// 뚫리는 순간을 정방향으로 지날 때 한 번 흔들린다(시간 구동). 다른 장에서 곧장 건너오면 흔들지 않는다(렌더러가 초기화)
let shakeStart = -1;
let lastScene2S = -1;

export function resetChapter7Shake(): void {
	lastScene2S = -1;
}

function estimate(k: number): number {
	// 신호가 쌓일수록 흔들림이 84 로 모이는 추정값(같은 k 는 같은 값)
	const spread =
		(26 * (hash(k) * 2 - 1) * Math.pow(1 - k / SIGNAL_COUNT, 0.7)) / Math.sqrt(1 + k / 6);
	return Math.max(0, Math.min(100, Math.round(84 + spread)));
}
type Gauge = { x0: number; span: number; y: number };
function gaugeGeometry(): Gauge {
	const span = Math.min(W * 0.8, G.numSize * 3.4);
	return { x0: W / 2 - span / 2, span, y: G.gaugeY };
}
const GAUGE_MIN = 50;
const GAUGE_MAX = 100;
const gaugeX = (gauge: Gauge, value: number): number =>
	gauge.x0 + (gauge.span * (value - GAUGE_MIN)) / (GAUGE_MAX - GAUGE_MIN);
function drawGauge(k: number, shake: number, visible: number, t: number): void {
	if (visible <= 0.003) return;
	const gauge = gaugeGeometry();
	ctx.lineCap = 'round';
	strokePoly(
		[gauge.x0, gauge.y, gauge.x0 + gauge.span, gauge.y],
		1,
		'rgb(255,226,190)',
		0.35 * visible
	);
	for (let v = GAUGE_MIN; v <= GAUGE_MAX; v += 5) {
		const x = gaugeX(gauge, v);
		const major = v % 25 === 0;
		if (v === 75) {
			strokePoly([x, gauge.y - 9, x, gauge.y + 9], 2, rgba(RED, 1), 0.85 * visible);
			drawSprite(glowSprite(RED), x, gauge.y, 14, 0.5 * visible);
		} else {
			strokePoly(
				[x, gauge.y - (major ? 6 : 3.5), x, gauge.y + (major ? 6 : 3.5)],
				1,
				'rgb(255,226,190)',
				(major ? 0.55 : 0.32) * visible
			);
		}
	}
	// 흔들림 폭(신호가 쌓일수록 좁아진다)과 지나온 바늘 자리들
	const value = estimate(k);
	const band = gauge.span * Math.min(0.5, (shake / G.numSize) * 1.4);
	if (band > 1) {
		ctx.globalAlpha = Math.min(1, 0.22 * visible);
		ctx.drawImage(
			glowSprite([255, 196, 120]),
			gaugeX(gauge, value) - band,
			gauge.y - 7,
			band * 2,
			14
		);
	}
	for (let back = 6; back >= 1; back--) {
		if (k - back < 0) continue;
		const x = gaugeX(gauge, estimate(k - back));
		drawSprite(glowSprite([255, 200, 130]), x, gauge.y, 7, (0.4 - back * 0.055) * visible);
	}
	const x = gaugeX(gauge, value) + (REDUCED ? 0 : Math.sin(t * 31) * shake * 0.05);
	strokePoly([x, gauge.y - 12, x, gauge.y + 12], 1.6, 'rgb(255,236,210)', 0.95 * visible);
	drawSprite(glowSprite([255, 196, 120]), x, gauge.y, 20, 0.6 * visible);
}
function drawLabPieces(s: number, parallax: number): void {
	ctx.globalCompositeOperation = 'source-over';
	for (const piece of lab.pieces) {
		const on = smooth(piece.appear[0], piece.appear[1], s);
		if (on <= 0.003) continue;
		// 들어설 때 아래에서 살짝 올라온다
		const rise = (1 - on) * 0.03 * H;
		ctx.globalAlpha = on;
		ctx.drawImage(piece.canvas, piece.x, piece.y - parallax + rise, piece.w, piece.h);
	}
}
function drawLabLights(s: number, t: number, parallax: number, recent: number): void {
	const L = lab.layout;
	const y = L.axisY - parallax;
	ctx.globalCompositeOperation = 'lighter';
	const laser = smooth(0.1, 0.2, s);
	if (laser > 0.003) {
		// 레이저 끝 발광과 칼슘 원자를 두드리는 가는 빔
		drawSprite(glowSprite(COLOR_B), L.laser.x1, y, G.m * 0.07, 0.75 * laser);
		drawSprite(glowSprite(WHITE), L.laser.x1, y, 3.5, laser);
		const beam = smooth(0.16, 0.26, s);
		strokePoly([L.laser.x1, y, L.source, y], 1.2, rgba(COLOR_B, 1), 0.5 * beam);
		strokePoly([L.laser.x1, y, L.source, y], 5, rgba(COLOR_B, 1), 0.08 * beam);
		const glow = beam * (0.8 + 0.2 * Math.sin(t * 7));
		drawSprite(glowSprite([255, 196, 130]), L.source, y, G.m * 0.06, 0.6 * glow);
		drawSprite(glowSprite(WHITE), L.source, y, 2.5, glow);
		strokePoly([L.source, y, L.detector.x0, y], 1, 'rgb(255,226,190)', 0.18 * smooth(0.3, 0.44, s));
	}
	// 신호가 들어올 때마다 검출기 창이 반짝인다
	const detector = smooth(0.32, 0.44, s);
	if (detector > 0.003) {
		drawSprite(
			glowSprite([170, 220, 255]),
			L.detector.x0,
			y,
			G.m * 0.05,
			(0.25 + 0.6 * recent) * detector
		);
		drawSprite(glowSprite(WHITE), L.detector.x0, y, 2.5, (0.4 + 0.6 * recent) * detector);
	}
}
function drawSignals(s: number, landed: number): number {
	// 떨어지는 신호 점: 게이지의 바늘 근처에 내려앉으며 짧게 빛난다
	const sig = signals;
	const gauge = gaugeGeometry();
	const streak = glowSprite([255, 230, 190]);
	let recent = 0;
	ctx.globalCompositeOperation = 'lighter';
	for (let k = landed - 1; k >= 0; k--) {
		const age = s - sig.landAt[k];
		if (age > 0.03) break;
		const fresh = 1 - age / 0.03;
		recent = Math.max(recent, fresh);
		const x = gaugeX(gauge, estimate(k)) + sig.dx[k] * 14;
		drawSprite(glowSprite([255, 210, 150]), x, gauge.y, 12 * G.sizeScale, fresh * 0.7);
	}
	for (let k = landed; k < SIGNAL_COUNT; k++) {
		const lead = sig.landAt[k] - s;
		if (lead > SIGNAL_FALL) break;
		const f = 1 - lead / SIGNAL_FALL;
		const x = gaugeX(gauge, estimate(Math.max(0, k - 1))) + sig.dx[k] * 14;
		const yy = lerp(-20, gauge.y, f * f);
		ctx.globalAlpha = 0.85;
		ctx.drawImage(streak, x - 3, yy - 18 * f - 4, 6, 22 * f + 8);
	}
	return recent;
}
function drawTornLine(y: number, gap: number, I: number, recoil: number, t: number): void {
	// 뚫린 75 선: 가운데가 끊기고 끊긴 끝은 위로 말려 올라간 채 달아올라 있다
	const xN = W * 0.5;
	const curl = 0.06 * W;
	const lift = G.bendMax * 0.35;
	const left: number[] = [];
	const right: number[] = [];
	const step = 8;
	const offset = (x: number, end: number): number => {
		const d = Math.abs(x - end);
		const c = d < curl ? Math.pow(1 - d / curl, 2) : 0;
		return -lift * c + recoil * Math.sin(x * 0.03) * c;
	};
	for (let x = -0.05 * W; x < xN - gap; x += step) left.push(x, y + offset(x, xN - gap));
	left.push(xN - gap, y + offset(xN - gap, xN - gap));
	for (let x = 1.05 * W; x > xN + gap; x -= step) right.push(x, y + offset(x, xN + gap));
	right.push(xN + gap, y + offset(xN + gap, xN + gap));
	ctx.globalAlpha = Math.min(1, 0.08 * I);
	ctx.drawImage(glowSprite(RED), -0.05 * W, y - G.m * 0.08, 1.1 * W, G.m * 0.16);
	laserPasses(left, I);
	laserPasses(right, I);
	const smolder = I * (0.75 + 0.25 * Math.sin(t * 5.3));
	for (const end of [
		[left[left.length - 2], left[left.length - 1]],
		[right[right.length - 2], right[right.length - 1]]
	]) {
		drawSprite(glowSprite([255, 120, 60]), end[0], end[1], 18, 0.7 * smolder);
		drawSprite(glowSprite([255, 236, 210]), end[0], end[1], 4, smolder);
	}
}
function drawQmMark(alpha: number): void {
	// 이 장치에서 양자역학이 예측한 자리: 84 와 겹치는 가는 표식
	if (alpha <= 0.003) return;
	const xN = W * 0.5;
	const half = G.numSize * 0.9;
	const y = G.numY1;
	const color = 'rgb(175,232,255)';
	ctx.lineCap = 'round';
	strokePoly([xN - half, y, xN + half, y], 1, color, 0.8 * alpha);
	strokePoly([xN - half, y - 6, xN - half, y + 6], 1, color, 0.8 * alpha);
	strokePoly([xN + half, y - 6, xN + half, y + 6], 1, color, 0.8 * alpha);
	drawSprite(glowSprite([150, 220, 255]), xN - half, y, 10, 0.5 * alpha);
	drawSprite(glowSprite([150, 220, 255]), xN + half, y, 10, 0.5 * alpha);
	ctx.globalAlpha = Math.min(1, 0.75 * alpha);
	ctx.font = `${Math.round(11 * G.sizeScale)}px ${FONT_STACK}`;
	ctx.textAlign = 'right';
	ctx.textBaseline = 'bottom';
	ctx.fillStyle = color;
	ctx.fillText(QM_LABEL, xN + half, y - G.numSize * 0.42);
}
export const GLANCE_PERIOD = 2.4; // 7-4 · 6-4 빛이 문 쪽을 힐끗 보는 주기(초)
function drawGlance(s: number, t: number, parallax: number): void {
	// 7-4: 뚫린 선 너머로 출발 전부터 고정된 창살 문이 희미하게 비치고, 빛이 그쪽을 힐끗 본다
	// 문은 뒤쪽 오실로스코프와 겹치지 않게: 세로 화면은 선과 오실로스코프 사이 띠, 가로 화면은 오실로스코프 왼쪽
	const on = smooth(3.08, 3.4, s);
	if (on <= 0.003) return;
	const image = gateImages.fixed;
	let gate: Point;
	let scale = 1;
	if (G.portrait) {
		const bandTop = G.lineY2 + G.smallNum * 0.3;
		const scopeTop = lab.scope.y - parallax;
		gate = { x: W * 0.56, y: (bandTop + scopeTop) / 2 };
		scale = Math.max(0.5, Math.min(1, ((scopeTop - bandTop) / 2 - 6) / (image.r * 1.4)));
	} else {
		gate = { x: W * 0.46, y: 0.37 * H };
	}
	const light = { x: W * (G.portrait ? 0.18 : 0.2), y: gate.y };
	drawGate(gate, image, 0.5 * on * (0.85 + 0.15 * Math.sin(t * 1.7)), 0, scale);
	const phase = REDUCED ? 0.3 : (t % GLANCE_PERIOD) / GLANCE_PERIOD;
	const look = Math.sin(clamp01(phase / 0.6) * Math.PI);
	const reach = (gate.x - light.x) * 0.24 * look;
	for (let i = 4; i >= 1; i--) {
		const x = light.x + (reach * i) / 4;
		drawSprite(glowSprite(COLOR_A), x, light.y, G.m * 0.06, 0.22 * on * look * (1 - i * 0.15));
	}
	drawLight(light.x, light.y, 0.7 * on, COLOR_A, { angle: 0, len: reach * 1.2 });
}
export function scene2(s: number, local: number, t: number): void {
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	const u = s - 1;
	// 뚫리는 순간을 정방향으로 지날 때 한 번 흔들린다(시간 구동)
	if (lastScene2S >= 0 && lastScene2S < EMBER_BREAK_S && s >= EMBER_BREAK_S && !REDUCED)
		shakeStart = t;
	lastScene2S = s;
	const shakeAge = (t - shakeStart) * MILLISECONDS_PER_SECOND;
	if (shakeStart >= 0 && shakeAge >= 0 && shakeAge < SHAKE_MS && !REDUCED) {
		const amp = SHAKE_PX * Math.exp(-shakeAge / (SHAKE_MS * 0.35));
		ctx.translate(Math.sin(t * 95) * amp, Math.cos(t * 83) * amp);
	}
	const parallax = Math.min(local * 0.02, H * (LAB_EXTRA - 1));
	const dim = 1 - 0.25 * smooth(3.05, 3.4, s);
	ctx.drawImage(lab.back, -8, -parallax - 8, W + 16, H * LAB_EXTRA + 16);
	drawLabPieces(s, parallax);
	const landed = signalsLanded(Math.min(s, 1));
	const xN = W * 0.5;
	ctx.globalCompositeOperation = 'lighter';
	drawDust(
		{
			tint: 'lab',
			vis: 0.6 * dim,
			drift: 0.3,
			scroll: local,
			lights: [
				{ x: W * 0.22, y: H * 0.05, I: 0.7, R2: Math.pow(G.m * 0.5, 2) },
				{ x: xN, y: G.gaugeY, I: 0.5 * smooth(0.05, 0.2, s), R2: Math.pow(G.m * 0.25, 2) }
			],
			laser: null,
			glint: 0,
			t,
			ambient: 0.12
		},
		0
	);
	drawDust(
		{
			tint: 'lab',
			vis: 0.5 * dim,
			drift: 0.3,
			scroll: local,
			lights: [],
			laser: null,
			glint: 0,
			t,
			ambient: 0.25
		},
		1
	);
	const recent = s < 1.1 ? drawSignals(Math.min(s, 1), landed) : 0;
	drawLabLights(s, t, parallax, recent);
	// 숫자 · 게이지
	const half = G.numSize * 0.36;
	if (s < 1) {
		const k = landed;
		const visible = smooth(0.03, 0.12, s);
		const shake = (G.numSize * 0.2 * Math.pow(1 - k / SIGNAL_COUNT, 0.8)) / Math.sqrt(1 + k / 10);
		const offset = (n: number): { x: number; y: number } => ({
			x: (hash(n + 0.5) - 0.5) * 2 * shake,
			y: (hash(n + 0.25) - 0.5) * 1.2 * shake
		});
		const tremble = REDUCED ? 0 : Math.sin(t * 23) * shake * 0.25;
		const ghost = Math.min(1, shake / 8);
		// 84 로 모이는 점수 숫자는 문구 대조(84)가 어긋나면 숨긴다(게이지는 남긴다)
		if (!MARKS.score84) {
			for (let back = 2; back >= 1; back--) {
				if (k - back < 0) continue;
				const go = offset(k - back);
				drawGlowText(
					String(estimate(k - back)),
					xN + go.x,
					G.numY0 + go.y,
					G.numSize,
					PALETTE_GOLD,
					visible * ghost * (back === 1 ? 0.18 : 0.08),
					1
				);
			}
			const o = offset(k);
			drawGlowText(
				String(estimate(k)),
				xN + o.x + tremble,
				G.numY0 + o.y,
				G.numSize,
				PALETTE_GOLD,
				visible,
				shake > 2 ? 1 : dpr
			);
		}
		drawGauge(k, shake, visible, t);
	} else {
		// 7-2 첫머리: 게이지가 멈춘 채 사라진다
		drawGauge(SIGNAL_COUNT, 0, 1 - smooth(0.02, 0.12, u), t);
		const contactY = G.lineY2 + half - G.bendMax;
		let yN: number;
		if (s < EMBER_BREAK_S) yN = lerp(G.numY0, contactY, easeInOut(clamp01((u - 0.05) / 0.37)));
		else yN = lerp(contactY, G.numY1, easeOutCubic(clamp01((u - 0.45) / 0.12)));
		const lineIn = smooth(0, 0.1, u);
		const tip = lerp(-0.05 * W, 1.05 * W, clamp01(u / 0.1));
		if (s < EMBER_BREAK_S) {
			const bend = Math.max(0, G.lineY2 - (yN - half - 4));
			const tension = smooth(0.36, 0.45, u);
			const vibrate = REDUCED ? 0 : tension * 1.6 * Math.sin(t * 60);
			const sigma = G.numSize * 0.75;
			const bendFn = (x: number): number =>
				-bend * Math.exp(-Math.pow((x - xN) / sigma, 2)) +
				vibrate * Math.exp(-Math.pow((x - xN) / (sigma * 2), 2));
			drawLaser(G.lineY2, tip, lineIn, bendFn);
			if (tension > 0.003) {
				const contact = G.lineY2 - bend;
				drawSprite(
					glowSprite([255, 236, 220]),
					xN - sigma * 0.5,
					contact + bend * 0.35,
					10 + tension * 12,
					tension
				);
				drawSprite(
					glowSprite([255, 236, 220]),
					xN + sigma * 0.45,
					contact + bend * 0.4,
					8 + tension * 10,
					tension * 0.9
				);
				drawSprite(glowSprite(RED), xN, contact, G.m * 0.2, tension * 0.5);
			}
		} else {
			const since = u - (EMBER_BREAK_S - 1);
			const gap = G.numSize * 0.42 * easeOutCubic(clamp01(since / 0.05));
			const recoil = REDUCED ? 0 : G.bendMax * 0.6 * Math.exp(-since * 25) * Math.sin(since * 140);
			drawTornLine(G.lineY2, gap, 1 - 0.3 * smooth(1.0, 1.4, u), recoil, t);
			// 터진 직후의 섬광(한 번)
			const flash = Math.exp(-since / 0.012);
			if (flash > 0.01) {
				ctx.globalAlpha = Math.min(1, 0.45 * flash);
				ctx.fillStyle = 'rgb(255,226,190)';
				ctx.fillRect(-10, -10, W + 20, H + 20);
				drawSprite(glowSprite(WARM), xN, G.lineY2, G.m * 0.7, flash);
				drawSprite(glowSprite(WHITE), xN, G.lineY2, G.m * 0.12, flash);
			}
			drawEmbers(s);
		}
		if (!MARKS.score75)
			drawGlowText(
				'75',
				W * (G.portrait ? 0.86 : 0.9),
				G.lineY2 + G.smallNum * 0.5,
				G.smallNum * 0.7,
				PALETTE_RED,
				lineIn * 0.75
			);
		drawQmMark(smooth(2.08, 2.35, s));
		if (!MARKS.score84)
			drawGlowText('84', xN, yN, G.numSize, PALETTE_GOLD, 1 - 0.35 * smooth(3.05, 3.4, s));
	}
	drawDust(
		{
			tint: 'lab',
			vis: 0.55 * dim,
			drift: 0.3,
			scroll: local,
			lights: [],
			laser: null,
			glint: 0,
			t,
			ambient: 0.5
		},
		2
	);
	if (dim < 1) {
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1 - dim;
		ctx.fillStyle = '#000';
		ctx.fillRect(-10, -10, W + 20, H + 20);
		// 7-4: 어두워진 장면 위에 고정된 문과 힐끗 보는 빛을 얹는다
		ctx.globalCompositeOperation = 'lighter';
		ctx.globalAlpha = 1;
		drawGlance(s, t, parallax);
	}
	ctx.globalCompositeOperation = 'lighter';
	drawTwinEdges(t, 0);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
// 불씨: 식으며 흰색 → 호박색 → 붉은색 → 사라짐. 머리는 미리 그린 스프라이트, 꼬리는 색 단계별로 한 번에 긋는다
const EMBER_STAGES: Rgb[] = [
	[255, 250, 235],
	[255, 214, 140],
	[255, 160, 60],
	[235, 72, 32],
	[140, 26, 18]
];
const EMBER_STAGE_AT = [0.12, 0.3, 0.55, 0.8]; // 수명 비율 경계
const EMBER_TAIL_WIDTH = [1.6, 1.4, 1.2, 1, 0.8];
const EMBER_GRAVITY = 0.85; // 화면 높이/초²
const EMBER_TAIL_S = 0.028; // 짧은 꼬리 길이(초)
type Position = { x: number; y: number };
function emberPosition(i: number, tau: number, out: Position): void {
	const drag = embers.drag[i];
	const decay = (1 - Math.exp(-drag * tau)) / drag;
	const g = EMBER_GRAVITY * H;
	out.x = embers.x0[i] + embers.vx[i] * decay;
	out.y = embers.y0[i] + (g * tau) / drag + (embers.vy[i] - g / drag) * decay;
}
const emberNow: Position = { x: 0, y: 0 };
const emberTail: Position = { x: 0, y: 0 };
function drawEmbers(s: number): void {
	const e = embers;
	const tails = EMBER_STAGES.map(() => new Path2D());
	const sprites = EMBER_STAGES.map(emberSprite);
	ctx.globalCompositeOperation = 'lighter';
	for (let i = 0; i < e.n; i++) {
		const tau = (s - e.start[i]) * SECONDS_PER_S;
		if (tau <= 0) continue;
		const age = tau / e.life[i];
		if (age >= 1) continue;
		emberPosition(i, tau, emberNow);
		if (emberNow.y > H + 20 || emberNow.x < -20 || emberNow.x > W + 20) continue;
		let stage = 0;
		while (stage < EMBER_STAGE_AT.length && age >= EMBER_STAGE_AT[stage]) stage++;
		emberPosition(i, Math.max(0, tau - EMBER_TAIL_S), emberTail);
		tails[stage].moveTo(emberTail.x, emberTail.y);
		tails[stage].lineTo(emberNow.x + 0.01, emberNow.y);
		const fade = (1 - age) * e.bright[i];
		const radius = e.size[i] * (2.2 - age) * G.sizeScale;
		drawSprite(sprites[stage], emberNow.x, emberNow.y, radius, fade);
	}
	ctx.lineCap = 'round';
	for (let b = 0; b < EMBER_STAGES.length; b++) {
		ctx.globalAlpha = 0.55 - b * 0.08;
		ctx.lineWidth = EMBER_TAIL_WIDTH[b];
		ctx.strokeStyle = rgba(EMBER_STAGES[b], 1);
		ctx.stroke(tails[b]);
	}
}
