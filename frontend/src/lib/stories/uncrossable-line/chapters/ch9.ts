// 9장 다시 움직이는 빛(시제품 flow.src.html :4559-4665): 1장 구도로 돌아와 멈췄던 두 빛이 물결을 지나 양쪽 문에 동시에 닿고(9-1),
// 갈라진 붉은 선만 남으며(9-2), 빈 책상의 잔상과 덮인 동전이 겹쳤다 흩어진다(9-3).
import {
	bokehSprite,
	clamp01,
	COLOR_A,
	COLOR_B,
	ctx,
	darken,
	drawCoveredCoin,
	drawCrackedLaser,
	drawDust,
	drawGate,
	drawGlowText,
	drawLight,
	drawPass,
	drawRibbon,
	drawSprite,
	drawTank,
	drawTwinEdges,
	dustLayers,
	easeInOut,
	easeOutCubic,
	G,
	glowSprite,
	H,
	lerp,
	MARKS,
	PALETTE_RED,
	REDUCED,
	ringSprite,
	roundRectPath,
	seeded,
	smooth,
	W,
	WARM,
	type DustOptions,
	type Rect,
	type Rgb
} from '../linePaint.ts';
import { bgInk, gateImages } from '../lineLayers.ts';
import { waterFallbackImage } from '../waveGl.ts';
import { drawResultLamp } from './ch1.ts';
import { officeLayer, officeLayout } from './ch2.ts';

function drawTankCaustic(rect: Rect, I: number): void {
	if (I <= 0.003) return;
	const image = waterFallbackImage();
	ctx.save();
	roundRectPath(
		ctx,
		rect.x - rect.w / 2,
		rect.y - rect.h / 2,
		rect.w,
		rect.h,
		Math.min(10, rect.w * 0.08)
	);
	ctx.clip();
	ctx.globalCompositeOperation = 'lighter';
	ctx.globalAlpha = Math.min(1, I);
	ctx.drawImage(image, rect.x - rect.w / 2, rect.y - rect.h / 2, rect.w, rect.h);
	ctx.restore();
}
const SCATTER_COUNT = 140;
const scatter = (() => {
	const random = seeded(131);
	const s = {
		u: new Float32Array(SCATTER_COUNT),
		v: new Float32Array(SCATTER_COUNT),
		angle: new Float32Array(SCATTER_COUNT),
		speed: new Float32Array(SCATTER_COUNT),
		size: new Float32Array(SCATTER_COUNT),
		tint: new Uint8Array(SCATTER_COUNT)
	};
	for (let i = 0; i < SCATTER_COUNT; i++) {
		s.u[i] = random();
		s.v[i] = random();
		s.angle[i] = random() * Math.PI * 2;
		s.speed[i] = 0.3 + random() * 0.9;
		s.size[i] = 0.5 + random() * random() * 2;
		s.tint[i] = Math.floor(random() * 3);
	}
	return s;
})();
export function chapter9(s: number, local: number, t: number): void {
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	ctx.drawImage(bgInk, 0, 0, W, H);
	ctx.globalCompositeOperation = 'lighter';
	const C = G.C;
	// 9-1: 멈췄던 두 빛이 다시 움직여 물결을 지나 양쪽 문에 동시에 닿는다
	const go = easeInOut(clamp01((s - 0.12) / 0.48));
	const arrive = 0.6;
	const lightsI = 1 - smooth(1.05, 1.6, s);
	const tremble = REDUCED ? 1 : 1 + 0.05 * (1 - smooth(0.1, 0.2, s)) * Math.sin(t * 13);
	const posA = { x: lerp(G.A.x, G.gateA.x, go), y: lerp(G.A.y, G.gateA.y, go) };
	const posB = { x: lerp(G.B.x, G.gateB.x, go), y: lerp(G.B.y, G.gateB.y, go) };
	const flash = s >= arrive ? Math.exp(-(s - arrive) / 0.06) : 0;
	const lights = [
		{ x: posA.x, y: posA.y, I: 0.9 * lightsI, R2: Math.pow(G.m * 0.2, 2) },
		{ x: posB.x, y: posB.y, I: 0.9 * lightsI, R2: Math.pow(G.m * 0.2, 2) },
		{ x: W / 2, y: G.laserY, I: 0.3, R2: Math.pow(G.m * 0.5, 2) }
	];
	const fadeAll = 1 - 0.85 * smooth(2.72, 3.0, s);
	const dustOptions: DustOptions = {
		tint: 'warm',
		vis: 0.9 * fadeAll,
		drift: 0.66 + 0.2 * s,
		scroll: local,
		lights,
		laser: { y: G.laserY, tip: 1.05 * W, I: 0.8 * fadeAll, w2: 22 * 22 },
		glint: 0.4 * lightsI,
		t,
		ambient: 0.12
	};
	dustLayers(dustOptions, 0, 1);
	// 갈라진 붉은 선: 9장 내내 남는다
	const lineI = lerp(0.55, 1, smooth(1.0, 1.4, s)) * fadeAll;
	drawCrackedLaser(G.laserY, lineI, 1);
	if (!MARKS.score75) drawGlowText('75', G.n75.x, G.n75.y, G.smallNum, PALETTE_RED, 0.35 * lineI);
	if (lightsI > 0.003) {
		const gateOn = (0.55 + 0.45 * flash) * lightsI;
		drawGate(G.gateA, gateImages.pair, gateOn);
		drawGate(G.gateB, gateImages.pair, gateOn);
		// 물통: 빛이 지나갈 때 청록 물빛이 밝아진다
		const kTank = 0.5 / 1.1;
		const passing = Math.exp(-Math.pow((go - kTank) / 0.12, 2));
		for (const rect of [G.tankA, G.tankB]) {
			drawTank(rect, lightsI, t, true);
			drawTankCaustic(rect, (0.25 + 0.75 * passing) * lightsI);
		}
		ctx.globalCompositeOperation = 'lighter';
		const I = lightsI * tremble;
		if (s < arrive) {
			drawRibbon(C.x, C.y, posA.x, posA.y, I, COLOR_A, 0.6, 1);
			drawRibbon(C.x, C.y, posB.x, posB.y, I, COLOR_B, 0.6, 2);
			const speed = go > 0 && go < 1 ? G.m * 0.12 : 0;
			drawLight(posA.x, posA.y, I, COLOR_A, {
				angle: Math.atan2(G.gateA.y - G.A.y, G.gateA.x - G.A.x),
				len: speed
			});
			drawLight(posB.x, posB.y, I, COLOR_B, {
				angle: Math.atan2(G.gateB.y - G.B.y, G.gateB.x - G.B.x),
				len: speed
			});
		} else {
			// 함께 답한다: 두 문에서 같은 순간 섬광
			const k = clamp01((s - arrive) / 0.35);
			drawRibbon(C.x, C.y, G.gateA.x, G.gateA.y, I * (1 - 0.5 * k), COLOR_A, 0.6, 1);
			drawRibbon(C.x, C.y, G.gateB.x, G.gateB.y, I * (1 - 0.5 * k), COLOR_B, 0.6, 2);
			drawPass(G.A, G.gateA, k, I, COLOR_A);
			drawPass(G.B, G.gateB, k, I, COLOR_B);
			for (const gate of [G.gateA, G.gateB]) {
				drawSprite(glowSprite(WARM), gate.x, gate.y, G.m * 0.6, 0.7 * flash * I);
				drawSprite(
					ringSprite([220, 240, 255]),
					gate.x,
					gate.y,
					G.m * (0.1 + 0.4 * (1 - flash)),
					0.5 * flash * I
				);
				drawResultLamp(gate, true, (0.4 + 0.6 * flash) * I);
			}
		}
	}
	drawTwinEdges(
		t,
		smooth(0.08, 0.4, s) * (1 - smooth(1.05, 1.6, s)) * 1.2,
		1 - smooth(1.6, 2.0, s)
	);
	// 9-3: 선 위로 빈 책상의 잔상과 덮인 동전이 겹쳤다가 보케로 흩어진다
	const ghost = smooth(2.04, 2.3, s) * (1 - smooth(2.42, 2.7, s));
	if (ghost > 0.003) {
		ctx.globalCompositeOperation = 'lighter';
		ctx.globalAlpha = 0.32 * ghost;
		ctx.drawImage(officeLayer(), 0, 0, W, H);
		drawCoveredCoin(
			officeLayout().coin.x,
			officeLayout().deskY + 0.05 * H,
			G.m * 0.045 + 4,
			0.8 * ghost
		);
	}
	const spread = clamp01((s - 2.38) / 0.5);
	if (spread > 0 && spread < 1) {
		const L = officeLayout();
		const colors: Rgb[] = [
			[255, 200, 140],
			[255, 170, 110],
			[200, 190, 170]
		];
		const scatterI = Math.sin(spread * Math.PI) * 0.8;
		for (let i = 0; i < SCATTER_COUNT; i++) {
			const x0 = scatter.u[i] * W;
			const y0 = L.deskY - 0.02 * H + scatter.v[i] * 0.2 * H;
			const dist = G.m * 0.5 * scatter.speed[i] * easeOutCubic(spread);
			const r = (4 + scatter.size[i] * 18 * spread) * G.sizeScale;
			drawSprite(
				bokehSprite(colors[scatter.tint[i]]),
				x0 + Math.cos(scatter.angle[i]) * dist,
				y0 + Math.sin(scatter.angle[i]) * dist - spread * 0.1 * H,
				r,
				scatterI * (0.4 + 0.6 * (1 - spread))
			);
		}
	}
	drawDust(dustOptions, 2);
	darken(0.8 * smooth(2.7, 3.0, s));
}
