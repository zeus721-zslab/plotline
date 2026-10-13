// 5장 말싸움을 게임으로(시제품 flow.src.html :3618-4103): 짙은 녹색 칠판 · 발광하는 분필과 카드. 벨의 게임 · 각본 · 답 칸 · 점수판.
// 문장 기준 그림(STEP 125, sentenceAt):
// - 5-3: 각본 ①(3번) · 이김 불(4번) · 각본 ②(5~6번) · 붉은 불 옮김(6~7번)은 시제품이 문장 경계에 맞춘 값이라 문장 기준으로 옮겼다(본문이 같아 진행값은 그대로).
// - 5-4: v3.5 에서 옛 3번이 새 3 · 4번으로 나뉘어 그림 → 문장 대응을 다시 잡았다.
//   선1(두 빨강 같음) = 2번 · 선2(왼쪽 빨강–오른쪽 파랑) = 3번 · 선3(왼쪽 파랑–오른쪽 빨강) = 4번 ·
//   채움 + 마지막 칸 저절로 같아짐 = 5번 · 파파 칸 깨짐 + '파랑·파랑에서 진다' = 6번.
//   선은 시제품의 문장 안 비율을 그대로 쓰고, 채움 · 깨짐은 시제품 구간(p .52-.76 · .78-.98)을 그 문장 길이에 맞춰 넣었다.
import {
	clamp01,
	ctx,
	dotSprite,
	dpr,
	drawBeats,
	drawDust,
	drawGate,
	drawGlowText,
	drawLabel,
	drawLaser,
	drawSprite,
	drawTwinEdges,
	dustLayers,
	circlePoints,
	context2d,
	easeInOut,
	easeOutCubic,
	FONT_STACK,
	G,
	glowLine,
	glowSprite,
	H,
	hash,
	lerp,
	makeCanvas,
	MARKS,
	mixWhite,
	PALETTE_GOLD,
	PALETTE_GREEN,
	PALETTE_RED,
	paintLayer,
	partialPath,
	RED,
	REDUCED,
	rgba,
	roundRectPath,
	seeded,
	smooth,
	vignetteOn,
	W,
	WHITE,
	type DustOptions,
	type Point,
	type Rgb
} from '../linePaint.ts';
import { bgInk, gateImages, layer } from '../lineLayers.ts';
import { sentenceAt, sentenceP } from '../lineScene.ts';
import { scene1 } from './ch1.ts';
import { boardLayer, CHALK, chalkDust, chalkStroke } from './ch4.ts';

const CARD_RED: Rgb = [255, 72, 60];
const CARD_BLUE: Rgb = [80, 130, 255];
const WIN_COLOR: Rgb = [120, 255, 170];
const LOSE_COLOR: Rgb = [255, 60, 40];
type CardKind = 'R' | 'B';
const cardColor = (k: CardKind): Rgb => (k === 'R' ? CARD_RED : CARD_BLUE);

// 5-3 문장 기준 임계값 [시작, 끝](비트 진행값). sentenceAt(문장 번호, 문장 안 비율)
const BEAT_5_3 = '5-3';
const at53 = (sentence: number, fraction: number): number =>
	sentenceAt(BEAT_5_3, sentence, fraction);
const SCRIPT_A_LABEL: [number, number] = [at53(3, 0.404), at53(3, 0.866)]; // 각본 ① 모두 예(3번)
const ANSWERS_SHOW: [number, number] = [at53(3, 0.558), at53(4, 0.018)]; // 답 '예 · 예'(3번 → 4번 처음)
const LAMPS_ON: [number, number] = [at53(4, 0.018), at53(4, 0.423)]; // 이김 · 짐 불(4번: 이긴다)
const SCRIPT_B_LABEL: [number, number] = [at53(5, 0.457), at53(6, 0.097)]; // 각본 ②(5번 → 6번 처음)
const ANSWER_CHANGE: [number, number] = [at53(5, 0.97), at53(6, 0.323)]; // 오른쪽 파랑이면 아니오(6번)
const LOSE_LEAVES_BB: [number, number] = [at53(6, 0.436), at53(6, 0.662)]; // 파파 붉은 불 꺼짐(6번)
const LOSE_TRAVEL: [number, number] = [at53(6, 0.21), at53(7, 0.002)]; // 붉은 불이 빨파로 옮겨 감(6번 → 7번 처음)
const LOSE_REACHES_RB: [number, number] = [at53(6, 0.888), at53(7, 0.207)]; // 빨파에 붉은 불(7번)

// 5-4 문장 기준 임계값
const BEAT_5_4 = '5-4';
const at54 = (sentence: number, fraction: number): number =>
	sentenceAt(BEAT_5_4, sentence, fraction);
const LINK_1: [number, number] = [at54(2, -0.211), at54(2, 0.837)];
const LINK_2: [number, number] = [at54(3, -0.009), at54(3, 0.695)];
const LINK_3: [number, number] = [at54(4, -0.009), at54(4, 0.695)];
// 5번 문장 안 비율: 시제품 p .52-.76(채움 .52 · .55 · .58 · .61 에서 각 .04, 마지막 선 .66-.76)을 0~1 로 옮긴 값
const FILL_START = { LR: 0, RR: 0.125, RB: 0.25, LB: 0.375 } as const;
const FILL_SPAN = 0.1667;
const LAST_LINK: [number, number] = [0.5833, 1];
// 6번 문장 안 비율: 시제품 p .78-.98(깨짐 .78-.90, 불똥 .78-.98)을 0~1 로 옮긴 값
const CRACK_END = 0.6;

type ChalkText = { canvas: HTMLCanvasElement; w: number; h: number; pad: number };
const chalkTextCache = new Map<string, ChalkText>();
function chalkTextSprite(text: string, size: number): ChalkText {
	const key = `chalk|${text}|${Math.round(size)}|${dpr}`;
	const hit = chalkTextCache.get(key);
	if (hit !== undefined) return hit;
	const font = `400 ${Math.round(size)}px ${FONT_STACK}`;
	ctx.font = font;
	const pad = size * 0.5;
	const w = ctx.measureText(text).width + pad * 2;
	const h = size * 1.4 + pad * 2;
	const canvas = ((): HTMLCanvasElement => {
		const c = makeCanvas(w * dpr, h * dpr);
		const g = context2d(c);
		g.scale(dpr, dpr);
		g.font = font;
		g.textBaseline = 'middle';
		g.shadowColor = 'rgba(200,255,225,0.55)';
		g.shadowBlur = size * 0.35 * dpr;
		g.fillStyle = 'rgba(236,246,238,0.92)';
		g.fillText(text, pad, h / 2);
		g.shadowBlur = 0;
		// 분필 결: 글자를 군데군데 긁어낸다
		g.globalCompositeOperation = 'destination-out';
		const random = seeded(Math.round(size) + text.length);
		const count = Math.floor(w * h * 0.03);
		for (let i = 0; i < count; i++) {
			g.fillStyle = `rgba(0,0,0,${(0.3 + random() * 0.5).toFixed(2)})`;
			g.fillRect(random() * w, random() * h, 0.6 + random(), 0.6 + random());
		}
		return c;
	})();
	const entry = { canvas, w, h, pad };
	chalkTextCache.set(key, entry);
	return entry;
}
const BELL_INEQUALITY = '|P(a,b) − P(a,c)| ≤ 1 + P(b,c)';
function bell51(p: number, t: number, I: number): void {
	// 5-1: 칠판에 분필 선이 하나씩 그어진다
	if (I <= 0.003) return;
	ctx.globalCompositeOperation = 'lighter';
	const y1 = (G.portrait ? 0.18 : 0.2) * H;
	const cx = W / 2;
	const reach = (G.portrait ? 0.38 : 0.3) * W;
	const u1 = smooth(0.02, 0.26, p);
	if (u1 > 0) {
		for (const dir of [-1, 1]) {
			const line = partialPath([cx, y1, cx + dir * reach, y1], u1);
			chalkStroke(line.pts, 2, CHALK, I, 11 + dir);
			if (u1 < 1) chalkDust(line.head[0], line.head[1], I);
			else
				chalkStroke(
					[
						cx + dir * reach - dir * 12,
						y1 - 8,
						cx + dir * reach,
						y1,
						cx + dir * reach - dir * 12,
						y1 + 8
					],
					2,
					CHALK,
					I,
					21 + dir
				);
		}
		chalkStroke(circlePoints(cx, y1, 6, 16), 2, CHALK, I * smooth(0.02, 0.06, p), 31);
		const label = smooth(0.2, 0.28, p) * I;
		for (const [dir, text] of [
			[-1, 'A'],
			[1, 'B']
		] as const) {
			const sprite = chalkTextSprite(text, G.m * 0.05 + 6);
			ctx.globalAlpha = Math.min(1, label);
			ctx.drawImage(
				sprite.canvas,
				cx + dir * reach - sprite.w / 2,
				y1 - sprite.h * 0.85,
				sprite.w,
				sprite.h
			);
		}
	}
	const size = Math.min(G.m * 0.058, 36);
	let sprite = chalkTextSprite(BELL_INEQUALITY, size);
	if (sprite.w > W * 0.92) sprite = chalkTextSprite(BELL_INEQUALITY, (size * W * 0.92) / sprite.w);
	const y2 = (G.portrait ? 0.34 : 0.38) * H;
	const x0 = W / 2 - sprite.w / 2;
	const reveal = smooth(0.3, 0.74, p);
	if (reveal > 0) {
		const textW = sprite.w - sprite.pad * 2;
		const shown = sprite.pad + textW * reveal;
		ctx.save();
		ctx.beginPath();
		ctx.rect(x0, y2 - sprite.h / 2, shown, sprite.h);
		ctx.clip();
		ctx.globalAlpha = Math.min(1, I);
		ctx.drawImage(sprite.canvas, x0, y2 - sprite.h / 2, sprite.w, sprite.h);
		ctx.restore();
		if (reveal < 1) chalkDust(x0 + shown, y2 + sprite.h * 0.15, I);
	}
	const u3 = smooth(0.76, 0.92, p);
	if (u3 > 0) {
		const textW = sprite.w - sprite.pad * 2;
		const pts: number[] = [];
		for (let i = 0; i <= 20; i++) {
			const u = i / 20;
			pts.push(
				x0 + sprite.pad + textW * u,
				y2 + sprite.h * 0.32 + Math.sin(u * Math.PI) * 3 - u * 3
			);
		}
		const line = partialPath(pts, u3);
		chalkStroke(line.pts, 1.8, CHALK, I * 0.9, 41);
		if (u3 < 1) chalkDust(line.head[0], line.head[1], I);
	}
}
function roomsLayer(): HTMLCanvasElement {
	return layer('rooms', (g) => {
		const sky = g.createLinearGradient(0, 0, 0, H);
		sky.addColorStop(0, '#03050a');
		sky.addColorStop(0.55, '#0a0e18');
		sky.addColorStop(1, '#040405');
		g.fillStyle = sky;
		g.fillRect(0, 0, W, H);
		const random = seeded(19);
		for (let i = 0; i < 160; i++) {
			g.fillStyle = `rgba(210,220,255,${(0.1 + random() * 0.4).toFixed(2)})`;
			g.fillRect(random() * W, random() * H * 0.45, 1, 1);
		}
		const horizon = 0.56 * H;
		g.globalCompositeOperation = 'lighter';
		const haze = g.createLinearGradient(0, horizon - 0.08 * H, 0, horizon + 0.04 * H);
		haze.addColorStop(0, 'rgba(60,80,120,0)');
		haze.addColorStop(0.7, 'rgba(70,90,130,0.18)');
		haze.addColorStop(1, 'rgba(60,80,120,0)');
		g.fillStyle = haze;
		g.fillRect(0, horizon - 0.08 * H, W, 0.12 * H);
		// 아득한 마을 불빛
		for (let i = 0; i < 40; i++) {
			g.fillStyle = `rgba(255,200,140,${(0.15 + random() * 0.35).toFixed(2)})`;
			g.fillRect(random() * W, horizon - random() * 0.01 * H, 1.2, 1.2);
		}
		g.globalCompositeOperation = 'source-over';
		g.fillStyle = '#050505';
		g.fillRect(0, horizon, W, H - horizon);
		// 두 건물: 화면 양쪽
		for (const fx of [0.22, 0.78]) {
			const bw = (G.portrait ? 0.4 : 0.24) * W;
			const top = 0.2 * H;
			g.fillStyle = '#08080a';
			g.fillRect(fx * W - bw / 2, top, bw, H - top);
			g.beginPath();
			g.moveTo(fx * W - bw / 2 - 6, top);
			g.lineTo(fx * W, top - 0.06 * H);
			g.lineTo(fx * W + bw / 2 + 6, top);
			g.closePath();
			g.fill();
			g.fillStyle = 'rgba(160,180,220,0.12)';
			g.fillRect(fx * W - bw / 2, top, 1, H - top);
		}
		vignetteOn(g, W / 2, H * 0.4, 0.5);
	});
}
function roomWindows(): { x: number; y: number; w: number; h: number }[] {
	const w = (G.portrait ? 0.3 : 0.16) * W;
	return [
		{ x: 0.22 * W, y: 0.36 * H, w, h: w * 1.1 },
		{ x: 0.78 * W, y: 0.36 * H, w, h: w * 1.1 }
	];
}
function drawCard(x: number, y: number, w: number, color: Rgb, flip: number, I: number): void {
	// flip 0 = 뒷면, 1 = 앞면(가로로 뒤집힌다)
	if (I <= 0.003) return;
	const scale = Math.abs(Math.cos(Math.PI * flip));
	const face = flip > 0.5;
	const h = w * 1.45;
	const cw = w * Math.max(0.04, scale);
	const r = Math.min(cw / 2, w * 0.1);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = Math.min(1, I);
	roundRectPath(ctx, x - cw / 2, y - h / 2, cw, h, r);
	ctx.fillStyle = face
		? rgba(
				color.map((v) => Math.round(v * 0.35)),
				1
			)
		: '#1d1a16';
	ctx.fill();
	ctx.globalCompositeOperation = 'lighter';
	if (face) {
		drawSprite(glowSprite(color), x, y, w * 1.3, 0.5 * I * scale);
		ctx.globalAlpha = Math.min(1, 0.55 * I);
		ctx.fillStyle = rgba(color, 1);
		roundRectPath(
			ctx,
			x - cw / 2 + cw * 0.12,
			y - h / 2 + w * 0.12,
			cw * 0.76,
			h - w * 0.24,
			r * 0.6
		);
		ctx.fill();
	} else {
		ctx.globalAlpha = Math.min(1, 0.25 * I);
		ctx.strokeStyle = 'rgb(220,200,170)';
		ctx.lineWidth = 0.8;
		roundRectPath(
			ctx,
			x - cw / 2 + cw * 0.15,
			y - h / 2 + w * 0.15,
			cw * 0.7,
			h - w * 0.3,
			r * 0.5
		);
		ctx.stroke();
	}
	ctx.globalAlpha = Math.min(1, 0.75 * I);
	ctx.lineWidth = 1.2;
	ctx.strokeStyle = face ? 'rgba(255,240,230,0.9)' : 'rgba(220,210,190,0.5)';
	roundRectPath(ctx, x - cw / 2, y - h / 2, cw, h, r);
	ctx.stroke();
}
function drawPlaque(text: string, x: number, y: number, size: number, I: number): void {
	if (I <= 0.003) return;
	ctx.font = `600 ${Math.round(size)}px ${FONT_STACK}`;
	const tw = ctx.measureText(text).width;
	const pw = tw + size * 1.2;
	const ph = size * 1.7;
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = Math.min(1, 0.85 * I);
	roundRectPath(ctx, x - pw / 2, y - ph / 2, pw, ph, ph / 2);
	ctx.fillStyle = '#16120e';
	ctx.fill();
	ctx.globalCompositeOperation = 'lighter';
	drawSprite(glowSprite([255, 236, 200]), x, y, pw * 0.8, 0.25 * I);
	ctx.globalAlpha = Math.min(1, 0.7 * I);
	ctx.strokeStyle = 'rgba(255,236,210,0.8)';
	ctx.lineWidth = 1;
	ctx.stroke();
	drawLabel(text, x, y + 0.5, size, 'rgb(255,244,230)', I);
}
function bell52(p: number, t: number, I: number): void {
	// 5-2: 어둠 속 멀리 떨어진 두 방. 각 방에서 카드가 뒤집히고 예/아니오 팻말이 오른다
	if (I <= 0.003) return;
	paintLayer(roomsLayer(), I);
	const windows = roomWindows();
	const cards = [CARD_RED, CARD_BLUE];
	const answers = ['예', '아니오'];
	windows.forEach((win, i) => {
		ctx.globalCompositeOperation = 'lighter';
		drawSprite(glowSprite([255, 190, 120]), win.x, win.y, win.w * 1.6, 0.22 * I);
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = Math.min(1, I);
		const room = ctx.createRadialGradient(win.x, win.y - win.h * 0.2, 0, win.x, win.y, win.h * 0.8);
		room.addColorStop(0, '#6e4a2a');
		room.addColorStop(1, '#22160d');
		ctx.fillStyle = room;
		ctx.fillRect(win.x - win.w / 2, win.y - win.h / 2, win.w, win.h);
		const flip = smooth(0.12 + i * 0.08, 0.3 + i * 0.08, p);
		drawCard(win.x, win.y + win.h * 0.02, win.w * 0.3, cards[i], flip, I);
		const sign = smooth(0.5 + i * 0.06, 0.62 + i * 0.06, p);
		// 팻말은 창 아래에서 올라와 창틀 위에 선다
		ctx.save();
		ctx.beginPath();
		ctx.rect(win.x - win.w, win.y - win.h, win.w * 2, win.h * 1.5);
		ctx.clip();
		drawPlaque(
			answers[i],
			win.x,
			win.y + win.h * 0.5 - sign * win.h * 0.2,
			Math.max(12, G.m * 0.04),
			sign * I
		);
		ctx.restore();
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = Math.min(1, I);
		ctx.fillStyle = '#0a0806';
		ctx.fillRect(win.x - 1.5, win.y - win.h / 2, 3, win.h * 0.35);
		ctx.lineWidth = 4;
		ctx.strokeStyle = '#0a0806';
		ctx.strokeRect(win.x - win.w / 2, win.y - win.h / 2, win.w, win.h);
		ctx.globalCompositeOperation = 'lighter';
		ctx.globalAlpha = Math.min(1, 0.4 * I);
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(255,214,170,0.7)';
		ctx.strokeRect(win.x - win.w / 2 - 2, win.y - win.h / 2 - 2, win.w + 4, win.h + 4);
	});
}
const PAIRS: [CardKind, CardKind][] = [
	['R', 'R'],
	['R', 'B'],
	['B', 'R'],
	['B', 'B']
];
const PAIR_NAMES = ['빨강·빨강', '빨강·파랑', '파랑·빨강', '파랑·파랑'];
function pairPanels(): Point[] {
	if (G.portrait)
		return [
			[0.28, 0.24],
			[0.72, 0.24],
			[0.28, 0.47],
			[0.72, 0.47]
		].map(([x, y]) => ({ x: x * W, y: y * H }));
	return [0.2, 0.4, 0.6, 0.8].map((x) => ({ x: x * W, y: 0.36 * H }));
}
function pairCardWidth(): number {
	return G.portrait ? 0.11 * W : Math.min(0.06 * W, 0.085 * G.m);
}
function drawLamp(x: number, y: number, color: Rgb, I: number): void {
	if (I <= 0.003) return;
	drawSprite(glowSprite(color), x, y, 22 * G.sizeScale, 0.75 * I);
	drawSprite(glowSprite(WHITE), x, y, 3.5, I);
}
function bell53(p: number, t: number, I: number): void {
	// 5-3: 카드 네 쌍이 차례로 뒤집힌다. 첫 각본에선 파파에 붉은 불, 각본을 바꾸자 붉은 불이 빨파로 옮겨 간다
	if (I <= 0.003) return;
	const panels = pairPanels();
	const cw = pairCardWidth();
	const ch = cw * 1.45;
	const labelSize = Math.max(11, G.m * 0.032);
	const scriptB = smooth(SCRIPT_B_LABEL[0], SCRIPT_B_LABEL[1], p);
	drawLabel(
		'각본 ① 모두 예',
		W / 2,
		(G.portrait ? 0.1 : 0.12) * H,
		labelSize * 1.1,
		'rgb(236,246,238)',
		(1 - scriptB) * smooth(SCRIPT_A_LABEL[0], SCRIPT_A_LABEL[1], p) * I
	);
	drawLabel(
		'각본 ② 오른쪽은 파랑이면 아니오',
		W / 2,
		(G.portrait ? 0.1 : 0.12) * H,
		labelSize * 1.1,
		'rgb(236,246,238)',
		scriptB * I
	);
	const travel = smooth(LOSE_TRAVEL[0], LOSE_TRAVEL[1], p);
	panels.forEach((panel, k) => {
		const flip = smooth(0.04 + 0.07 * k, 0.1 + 0.07 * k, p);
		const [left, right] = PAIRS[k];
		drawCard(panel.x - cw * 0.62, panel.y, cw, cardColor(left), flip, I);
		drawCard(panel.x + cw * 0.62, panel.y, cw, cardColor(right), flip, I);
		ctx.globalCompositeOperation = 'lighter';
		drawLabel(
			PAIR_NAMES[k],
			panel.x,
			panel.y - ch * 0.5 - labelSize * 1.6,
			labelSize * 0.9,
			'rgb(200,225,210)',
			0.7 * flip * I
		);
		const rightNo = right === 'B';
		const answerA = '예 · 예';
		const answerB = rightNo ? '예 · 아니오' : '예 · 예';
		const answerY = panel.y + ch * 0.5 + labelSize * 1.2;
		const show = smooth(ANSWERS_SHOW[0], ANSWERS_SHOW[1], p) * I;
		const change = rightNo ? smooth(ANSWER_CHANGE[0], ANSWER_CHANGE[1], p) : 0;
		drawLabel(answerA, panel.x, answerY, labelSize, 'rgb(255,244,230)', show * (1 - change));
		drawLabel(answerB, panel.x, answerY, labelSize, 'rgb(255,244,230)', show * change);
		// 이김(초록) · 짐(붉음) 불
		const lampY = answerY + labelSize * 1.5;
		const loseA = k === 3;
		const loseB = k === 1;
		const lampOn = smooth(LAMPS_ON[0], LAMPS_ON[1], p) * I;
		const toB =
			k === 3
				? smooth(LOSE_LEAVES_BB[0], LOSE_LEAVES_BB[1], p)
				: k === 1
					? smooth(LOSE_REACHES_RB[0], LOSE_REACHES_RB[1], p)
					: 0;
		const lose = lerp(loseA ? 1 : 0, loseB ? 1 : 0, toB);
		drawLamp(
			panel.x,
			lampY,
			lose > 0.5 ? LOSE_COLOR : WIN_COLOR,
			lampOn * (0.5 + 0.5 * Math.abs(lose - 0.5) * 2)
		);
		if (lose > 0.5) drawSprite(glowSprite(LOSE_COLOR), panel.x, panel.y, cw * 2.2, 0.25 * lampOn);
	});
	// 붉은 불이 파파에서 빨파로 옮겨 간다
	if (travel > 0.003 && travel < 0.999) {
		const from = panels[3];
		const to = panels[1];
		const lampOffset = cw * 1.45 * 0.5 + labelSize * 2.7;
		const x = lerp(from.x, to.x, easeInOut(travel));
		const y =
			lerp(from.y, to.y, easeInOut(travel)) + lampOffset - Math.sin(travel * Math.PI) * 0.1 * H;
		drawSprite(glowSprite(LOSE_COLOR), x, y, 30 * G.sizeScale, 0.8 * I);
		drawSprite(glowSprite(WHITE), x, y, 4, I);
	}
}
type Cell = Point & { color: Rgb; label: string };
type CellKey = 'LR' | 'LB' | 'RR' | 'RB';
function answerCells(): Record<CellKey, Cell> {
	const lx = (G.portrait ? 0.26 : 0.33) * W;
	const rx = (G.portrait ? 0.74 : 0.67) * W;
	const y1 = 0.2 * H;
	const y2 = (G.portrait ? 0.45 : 0.5) * H;
	return {
		LR: { x: lx, y: y1, color: CARD_RED, label: '왼쪽 빨강' },
		LB: { x: lx, y: y2, color: CARD_BLUE, label: '왼쪽 파랑' },
		RR: { x: rx, y: y1, color: CARD_RED, label: '오른쪽 빨강' },
		RB: { x: rx, y: y2, color: CARD_BLUE, label: '오른쪽 파랑' }
	};
}
function drawLink(
	a: Point,
	b: Point,
	r: number,
	u: number,
	color: Rgb,
	I: number,
	label: string,
	labelColor: string
): void {
	if (u <= 0 || I <= 0.003) return;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = Math.hypot(dx, dy);
	const pts = [
		a.x + (dx / len) * r,
		a.y + (dy / len) * r,
		b.x - (dx / len) * r,
		b.y - (dy / len) * r
	];
	const line = partialPath(pts, u);
	glowLine(line.pts, 1.6, color, I);
	if (u < 1) drawSprite(glowSprite(color), line.head[0], line.head[1], 14, 0.8 * I);
	else if (label !== '') {
		// 가로 선은 가운데 위, 대각선은 두 대각선이 엇갈리는 가운데를 피해 출발 쪽 1/4 지점 옆에 단다
		const nx = -dy / len;
		const ny = dx / len;
		const off = Math.max(12, G.m * 0.035);
		const flat = Math.abs(dy) < 1;
		const at = flat ? 0.5 : 0.27;
		const side = flat ? -1 : dx * dy > 0 ? 1 : -1;
		drawLabel(
			label,
			lerp(a.x, b.x, at) + nx * off * side,
			lerp(a.y, b.y, at) + ny * off * side,
			Math.max(11, G.m * 0.032),
			labelColor,
			0.9 * I
		);
	}
}
function bell54(p: number, t: number, I: number): void {
	// 5-4: 답 칸 네 개가 '같음'으로 이어지면 마지막 칸이 저절로 같아지고, 파파 칸이 붉게 깨진다
	if (I <= 0.003) return;
	const c = answerCells();
	const r = G.m * 0.075 + 8;
	const labelSize = Math.max(11, G.m * 0.03);
	const fillP = sentenceP(BEAT_5_4, 5, p);
	const crackP = sentenceP(BEAT_5_4, 6, p);
	ctx.globalCompositeOperation = 'lighter';
	drawLink(
		c.LR,
		c.RR,
		r,
		smooth(LINK_1[0], LINK_1[1], p),
		[255, 226, 170],
		I,
		'같음',
		'rgb(255,236,200)'
	);
	drawLink(
		c.LR,
		c.RB,
		r,
		smooth(LINK_2[0], LINK_2[1], p),
		[255, 226, 170],
		I,
		'같음',
		'rgb(255,236,200)'
	);
	drawLink(
		c.LB,
		c.RR,
		r,
		smooth(LINK_3[0], LINK_3[1], p),
		[255, 226, 170],
		I,
		'같음',
		'rgb(255,236,200)'
	);
	const crack = smooth(0, CRACK_END, crackP);
	for (const key of ['LR', 'RR', 'LB', 'RB'] as const) {
		const cell = c[key];
		const filled = smooth(FILL_START[key], FILL_START[key] + FILL_SPAN, fillP);
		drawSprite(glowSprite(cell.color), cell.x, cell.y, r * 2, 0.3 * I);
		glowLine(circlePoints(cell.x, cell.y, r, 40), 1.2, mixWhite(cell.color, 0.3), 0.8 * I);
		drawSprite(glowSprite([255, 214, 140]), cell.x, cell.y, r * 1.2, 0.45 * filled * I);
		drawLabel(
			filled > 0.5 ? '예' : '?',
			cell.x,
			cell.y,
			r * 0.75,
			'rgb(255,246,232)',
			(filled > 0.5 ? filled : 1 - filled * 2) * I
		);
		drawLabel(
			cell.label,
			cell.x,
			cell.y + r + labelSize * 1.2,
			labelSize,
			'rgb(205,228,215)',
			0.75 * I
		);
		if (key === 'LB' || key === 'RB')
			drawSprite(glowSprite(LOSE_COLOR), cell.x, cell.y, r * 1.6, 0.4 * crack * I);
	}
	// 파랑·파랑: 답이 달라야 이기는 칸. 이미 같아진 탓에 붉게 깨진다
	const last = smooth(LAST_LINK[0], LAST_LINK[1], fillP);
	if (last > 0) {
		const a = c.LB;
		const b = c.RB;
		if (crack <= 0.003) {
			drawLink(a, b, r, last, LOSE_COLOR, I, '달라야 이김', 'rgb(255,190,180)');
		} else {
			const x0 = a.x + r;
			const x1 = b.x - r;
			const pieces = 7;
			for (let k = 0; k < pieces; k++) {
				const u0 = k / pieces + 0.012 * crack;
				const u1 = (k + 1) / pieces - 0.012 * crack;
				const drop = crack * (hash(k + 5) - 0.3) * G.m * 0.05;
				const tilt = (hash(k + 9) - 0.5) * crack * 10;
				glowLine(
					[lerp(x0, x1, u0), a.y + drop - tilt, lerp(x0, x1, u1), a.y + drop + tilt],
					1.6,
					LOSE_COLOR,
					I * (1 - 0.3 * crack)
				);
			}
			const sparkAge = clamp01(crackP);
			const dot = dotSprite([255, 170, 140]);
			for (let i = 0; i < 40; i++) {
				const angle = hash(i * 2.3) * Math.PI * 2;
				const dist = G.m * 0.12 * hash(i * 1.7 + 3) * easeOutCubic(sparkAge);
				drawSprite(
					dot,
					(x0 + x1) / 2 + (hash(i) - 0.5) * (x1 - x0) * 0.8 + Math.cos(angle) * dist,
					a.y + Math.sin(angle) * dist + sparkAge * sparkAge * 20,
					2.5,
					(1 - sparkAge) * I
				);
			}
			drawLabel(
				'파랑·파랑에서 진다',
				W / 2,
				a.y + r + labelSize * 3.4,
				labelSize * 1.1,
				'rgb(255,190,180)',
				crack * I
			);
		}
	}
}
// 5-5 · 6-3 의 문 기울기(라디안). 빨강·빨강, 빨강·파랑, 파랑·빨강은 조금, 파랑·파랑만 크게 어긋난다
export const TILT_LEFT: Record<CardKind, number> = { R: 0, B: Math.PI / 4 };
export const TILT_RIGHT: Record<CardKind, number> = { R: Math.PI / 8, B: -Math.PI / 8 };
export function gamePositions(): { L: Point; R: Point; mid: Point; lineY: number } {
	const y = (G.portrait ? 0.26 : 0.3) * H;
	return {
		L: { x: (G.portrait ? 0.24 : 0.3) * W, y },
		R: { x: (G.portrait ? 0.76 : 0.7) * W, y },
		mid: { x: W / 2, y },
		lineY: (G.portrait ? 0.56 : 0.6) * H
	};
}
function bell55(p: number, t: number, I: number, local: number): void {
	// 5-5: 카드가 원형 창살 문 두 개로 바뀌고, 어긋난 각도가 보인다. 점수판은 붉은 선에 막히고 그 선이 1장 위치로 겹친다
	if (I <= 0.003) return;
	const pos = gamePositions();
	const image = gateImages.upright;
	const morph = smooth(0.02, 0.14, p);
	ctx.globalCompositeOperation = 'lighter';
	if (morph < 1) {
		drawCard(pos.L.x, pos.L.y, image.r * 0.9, CARD_RED, 1, (1 - morph) * I);
		drawCard(pos.R.x, pos.R.y, image.r * 0.9, CARD_BLUE, 1, (1 - morph) * I);
		ctx.globalCompositeOperation = 'lighter';
	}
	const q = clamp01((p - 0.14) / 0.38) * 4;
	const k = Math.min(3, Math.floor(q));
	const prev = Math.max(0, k - 1);
	const blend = k === 0 ? 1 : smooth(0, 0.25, q - k);
	const tiltL = lerp(TILT_LEFT[PAIRS[prev][0]], TILT_LEFT[PAIRS[k][0]], blend);
	const tiltR = lerp(TILT_RIGHT[PAIRS[prev][1]], TILT_RIGHT[PAIRS[k][1]], blend);
	const gateI = morph * I;
	const gateScale = 0.6 + 0.4 * morph;
	drawGate(pos.L, image, gateI, tiltL, gateScale);
	drawGate(pos.R, image, gateI, tiltR, gateScale);
	const labelSize = Math.max(11, G.m * 0.03);
	const legend = smooth(0.06, 0.14, p) * (1 - smooth(0.5, 0.56, p)) * I;
	drawLabel(
		'예 → 지나감',
		pos.L.x,
		pos.L.y + image.r * 1.65,
		labelSize,
		'rgb(205,240,220)',
		legend
	);
	drawLabel(
		'아니오 → 막힘',
		pos.R.x,
		pos.R.y + image.r * 1.65,
		labelSize,
		'rgb(255,200,190)',
		legend
	);
	// 두 문의 어긋난 각도: 가운데 부채꼴(파랑·파랑만 크게)
	const cycleOn = smooth(0.14, 0.2, p) * (1 - smooth(0.5, 0.56, p)) * I;
	if (cycleOn > 0.003) {
		const diff = tiltR - tiltL;
		const big = Math.abs(diff) > Math.PI / 4;
		const color: Rgb = big ? [255, 120, 80] : [255, 214, 150];
		const R = image.r * 1.1;
		const a0 = -Math.PI / 2 + tiltL;
		const a1 = -Math.PI / 2 + tiltR;
		ctx.globalAlpha = Math.min(1, 0.22 * cycleOn);
		ctx.fillStyle = rgba(color, 1);
		ctx.beginPath();
		ctx.moveTo(pos.mid.x, pos.mid.y);
		ctx.arc(pos.mid.x, pos.mid.y, R, Math.min(a0, a1), Math.max(a0, a1));
		ctx.closePath();
		ctx.fill();
		glowLine(
			[pos.mid.x, pos.mid.y, pos.mid.x + Math.cos(a0) * R, pos.mid.y + Math.sin(a0) * R],
			1.2,
			[200, 230, 255],
			0.9 * cycleOn
		);
		glowLine(
			[pos.mid.x, pos.mid.y, pos.mid.x + Math.cos(a1) * R, pos.mid.y + Math.sin(a1) * R],
			1.2,
			[200, 230, 255],
			0.9 * cycleOn
		);
		drawLabel(
			PAIR_NAMES[k],
			pos.mid.x,
			pos.mid.y + labelSize * 1.6,
			labelSize,
			big ? 'rgb(255,190,170)' : 'rgb(255,236,200)',
			cycleOn
		);
		drawLabel(
			big ? '크게 어긋남' : '조금 어긋남',
			pos.mid.x,
			pos.mid.y + labelSize * 3,
			labelSize * 0.9,
			big ? 'rgb(255,190,170)' : 'rgb(255,236,200)',
			0.75 * cycleOn
		);
	}
	// 점수판: 50 에서 오르다 붉은 선(75)에 막혀 멈춘다
	const move = easeInOut(smooth(0.76, 0.92, p));
	const lineY = lerp(pos.lineY, G.laserY, move);
	const lineI = smooth(0.48, 0.56, p) * I;
	drawLaser(lineY, 1.05 * W, lineI * (1 - 0.4 * smooth(0.9, 1, p)), null);
	const n75 = {
		x: lerp(W * (G.portrait ? 0.86 : 0.9), G.n75.x, move),
		y: lerp(pos.lineY - G.smallNum * 0.45, G.n75.y, move)
	};
	// 75 와 75 까지 오르는 점수는 문구 대조(75)가 어긋나면 숨긴다(붉은 선은 남긴다)
	if (!MARKS.score75)
		drawGlowText(
			'75',
			n75.x,
			n75.y,
			G.smallNum * lerp(0.7, 1, move),
			PALETTE_RED,
			lineI * 0.8 * (1 - smooth(0.9, 1, p))
		);
	const climb = smooth(0.52, 0.72, p);
	const scoreI = smooth(0.5, 0.55, p) * (1 - smooth(0.78, 0.86, p)) * I;
	if (scoreI > 0.003 && !MARKS.score75) {
		const value = Math.round(lerp(50, 75, climb));
		const size = G.m * 0.14;
		const y = lerp(pos.lineY + 0.22 * H, pos.lineY + size * 0.55, easeOutCubic(climb));
		const stuck = climb >= 1 ? (REDUCED ? 0 : Math.sin(t * 30) * 1.2) : 0;
		drawGlowText(String(value), W / 2, y + stuck, size, PALETTE_GOLD, scoreI, climb < 1 ? 1 : dpr);
		const hit = climb >= 1 ? Math.exp(-(p - 0.72) / 0.03) : 0;
		if (hit > 0.01) {
			drawSprite(glowSprite(RED), W / 2, pos.lineY, G.m * 0.3, 0.6 * hit * scoreI);
			drawSprite(glowSprite(WHITE), W / 2, pos.lineY, 8, hit * scoreI);
		}
	}
	// 1장의 구도가 겹쳐 비친다
	const overlay = smooth(0.84, 1, p) * I;
	if (overlay > 0.003)
		scene1(4.95, local, t, { alpha: overlay * 0.55, crack: 0, n84: 0, tankInterior: false });
}
function drawMiniPairs(y: number, I: number, lampOn: number[], color: Rgb): void {
	// 세로 화면에선 오른쪽 위 1장 문(gateB)을 피해 왼쪽으로 모은다
	const xs = G.portrait ? [0.13, 0.32, 0.51, 0.7] : [0.2, 0.4, 0.6, 0.8];
	const cw = Math.min(G.m * 0.035 + 4, 0.04 * W + 4);
	PAIRS.forEach(([left, right], k) => {
		const x = xs[k] * W;
		drawCard(x - cw * 0.6, y, cw, cardColor(left), 1, 0.85 * I);
		drawCard(x + cw * 0.6, y, cw, cardColor(right), 1, 0.85 * I);
		ctx.globalCompositeOperation = 'lighter';
		drawLamp(x, y - cw * 1.45 * 0.5 - 12, color, lampOn[k] * I);
	});
}
function bell56(p: number, t: number, I: number, local: number): void {
	// 5-6: 선 위로 85가 희미하게 · 네 조합 모두에 옅은 초록 불
	if (I <= 0.003) return;
	scene1(4.95, local, t, { alpha: 0.55 * I, crack: 0, n84: 0, tankInterior: false });
	drawLaser(G.laserY, 1.05 * W, 0.6 * I, null);
	ctx.globalCompositeOperation = 'lighter';
	const n85 = smooth(0.06, 0.3, p) * I;
	if (!MARKS.score85)
		drawGlowText('85', W / 2, G.laserY - G.m * 0.2, G.m * 0.2, PALETTE_GREEN, 0.5 * n85);
	const lamps = [0, 1, 2, 3].map((k) => 0.6 * smooth(0.32 + k * 0.06, 0.38 + k * 0.06, p));
	drawMiniPairs((G.portrait ? 0.14 : 0.15) * H, smooth(0.2, 0.32, p) * I, lamps, [150, 255, 190]);
}
export function chapter5(s: number, local: number, t: number): void {
	// 5-2 는 밤의 두 방, 5-6 은 1장 구도로 넘어가며 칠판이 옅어진다
	const away = smooth(1, 1.1, s) * (1 - smooth(2, 2.1, s));
	const toInk = smooth(4.76, 4.95, s);
	if (toInk > 0.003) {
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
		ctx.drawImage(bgInk, 0, 0, W, H);
	}
	paintLayer(boardLayer(), (1 - away) * (1 - 0.75 * toInk));
	ctx.globalCompositeOperation = 'lighter';
	const dustOptions: DustOptions = {
		tint: 'chalk',
		vis: 0.55 * (1 - away),
		drift: 0.12 * s,
		scroll: local,
		lights: [{ x: W / 2, y: 0, I: 0.6, R2: Math.pow(G.m * 0.6, 2) }],
		laser: null,
		glint: 0,
		t,
		ambient: 0.1
	};
	dustLayers(dustOptions, 0, 1);
	drawBeats([bell51, bell52, bell53, bell54, bell55, bell56], s, t, local);
	drawTwinEdges(t, 0);
	drawDust(dustOptions, 2);
}
