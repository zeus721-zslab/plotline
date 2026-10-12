// 보이지 않는 짝 미리 그림(화면 크기가 바뀔 때만 다시 그린다): 언덕 장면 · 하늘 별밭 · 사람과 망원경 · 6장 점 모양.
// 시제품 sirius-flow.src.html 의 시안 공용 함수(buildSceneA · drawFigure · buildSky 등)를 그대로 옮겼다(그리기 수치 무변경).

// 언덕 장면에서 시리우스 자리(시안 좌표 비율, 연출 배치)와 망원경 각도
export const HILL_SIRIUS = { fx: 0.38, fy: 0.4 };
export const TELESCOPE_START_ANGLE = -2.25; // 시안 그대로
// 언덕 이름 붙은 별(베가 · 데네브 · 알타이르): 번짐 배율 · 이름표 글자 크기 · 번짐 끝과 이름표 사이 여백(× s)
const NAMED_GLOW = 9;
const NAMED_FONT = 10.5;
const NAMED_LABEL_GAP = 2;
export const TINTS = ['#ffffff', '#dfe7ff', '#cbd8ff', '#fff1d8', '#ffdcb4'];

export type Random = () => number;

/** 시안 시드 난수(같은 시드면 같은 수열) */
export function rng(seed: number): Random {
	let v = seed >>> 0;
	return () => {
		v = (v + 0x6d2b79f5) >>> 0;
		let m = v;
		m = Math.imul(m ^ (m >>> 15), m | 1);
		m ^= m + Math.imul(m ^ (m >>> 7), m | 61);
		return ((m ^ (m >>> 14)) >>> 0) / 4294967296;
	};
}

export function gaussOf(r: Random): Random {
	return () => {
		let u = 0;
		let v = 0;
		while (!u) u = r();
		while (!v) v = r();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	};
}

export function star(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	color: string,
	glow: number
): void {
	const a0 = ctx.globalAlpha;
	if (glow) {
		const g = ctx.createRadialGradient(x, y, 0, x, y, size * glow);
		g.addColorStop(0, color);
		g.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.globalAlpha = 0.35 * a0;
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(x, y, size * glow, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = a0;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(x, y, size, 0, Math.PI * 2);
	ctx.fill();
}

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

/** 2D 그리기 문맥. 화면 밖 캔버스에서 null 이면 이 기기에서 그릴 수 없으므로 던진다(배경 컴포넌트가 안내로 바꾼다). */
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const ctx = canvas.getContext('2d');
	if (ctx === null) throw new Error('2d canvas is not available');
	return ctx;
}

/** 은하수 픽셀 밀도장(띠 단면 × 구름 덩어리 − 먼지 띠)을 그린 화면 밖 캔버스와 밀도 값 */
function milkyWay(
	w: number,
	h: number,
	horizon: number,
	bandUnit: number,
	r: Random
): { off: HTMLCanvasElement; dens: Float32Array; gw: number; gh: number; S: number } {
	const perm = new Uint8Array(512);
	{
		const p0 = [...Array(256).keys()];
		for (let i = 255; i > 0; i -= 1) {
			const j = (r() * (i + 1)) | 0;
			[p0[i], p0[j]] = [p0[j], p0[i]];
		}
		for (let i = 0; i < 512; i += 1) perm[i] = p0[i & 255];
	}
	const fade = (q: number): number => q * q * (3 - 2 * q);
	const hsh = (i: number, j: number): number => perm[(perm[i & 255] + j) & 255] / 255;
	const vnoise = (x: number, y: number): number => {
		const xi = Math.floor(x);
		const yi = Math.floor(y);
		const xf = fade(x - xi);
		const yf = fade(y - yi);
		const a = hsh(xi, yi);
		const b = hsh(xi + 1, yi);
		const c = hsh(xi, yi + 1);
		const d = hsh(xi + 1, yi + 1);
		return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
	};
	const fbm = (x: number, y: number, o: number): number => {
		let v = 0;
		let amp = 0.5;
		let f = 1;
		for (let k = 0; k < o; k += 1) {
			v += amp * vnoise(x * f, y * f);
			f *= 2.03;
			amp *= 0.5;
		}
		return v / (1 - Math.pow(0.5, o));
	};
	const a0 = [w * 0.98, -h * 0.04];
	const a1 = [w * 0.08, horizon];
	const dx = a1[0] - a0[0];
	const dy = a1[1] - a0[1];
	const len = Math.hypot(dx, dy);
	const ux = dx / len;
	const uy = dy / len;
	const nx = -uy;
	const ny = ux;
	const centerOff = (tt: number): number => bandUnit * (0.05 * Math.sin(tt * Math.PI * 1.1) - 0.02);
	const halfW = (tt: number): number => bandUnit * (0.13 + 0.14 * Math.pow(tt, 1.3));
	const S = 2;
	const gw = Math.ceil(w / S);
	const gh = Math.ceil(horizon / S);
	const dens = new Float32Array(gw * gh);
	const off = makeCanvas(gw, gh);
	const octx = context2d(off);
	const img = octx.createImageData(gw, gh);
	for (let py = 0; py < gh; py += 1) {
		for (let px = 0; px < gw; px += 1) {
			const X = px * S;
			const Y = py * S;
			const rx = X - a0[0];
			const ry = Y - a0[1];
			const tt = (rx * ux + ry * uy) / len;
			const o = rx * nx + ry * ny;
			if (tt < -0.15 || tt > 1.1) continue;
			const tc = Math.max(0, Math.min(1, tt));
			const hw = halfW(tc);
			const co = centerOff(tc);
			// 가장자리를 노이즈로 흐트러뜨린 띠 단면
			const wob = (fbm(X / (bandUnit * 0.18), Y / (bandUnit * 0.18), 4) - 0.5) * hw * 0.9;
			const v = (o - co - wob) / hw;
			const band = Math.exp(-v * v * 1.3);
			if (band < 0.01) continue;
			// 별구름 덩어리
			const cloud = fbm(X / (bandUnit * 0.09) + 11, Y / (bandUnit * 0.09) + 3, 5);
			let lum = band * (0.35 + 1.25 * Math.pow(cloud, 1.8)) * (0.45 + 0.9 * Math.pow(tc, 1.4));
			// 큰 틈(Great Rift): 데네브 근처에서 시작해 띠를 둘로 가르며 지평선 쪽으로
			const riftC =
				co +
				hw * (0.08 + 0.22 * Math.sin(tc * 4.2 + 0.6)) +
				(fbm(X / (bandUnit * 0.12) + 40, Y / (bandUnit * 0.12), 4) - 0.5) * hw * 0.6;
			const riftW =
				hw *
				(0.2 + 0.3 * fbm(X / (bandUnit * 0.2) + 7, Y / (bandUnit * 0.2) + 9, 3)) *
				Math.min(1, Math.max(0, (tc - 0.04) / 0.12)) *
				Math.min(1, Math.max(0, (0.95 - tc) / 0.15));
			const rd = riftW > 0 ? Math.exp(-Math.pow((o - riftC) / riftW, 2)) : 0;
			const ragged = fbm(X / (bandUnit * 0.035) + 21, Y / (bandUnit * 0.035) + 5, 4);
			lum *= 1 - Math.min(0.92, rd * (0.55 + ragged * 0.7));
			// 잔 먼지 줄기(띠 방향으로 늘어진 노이즈)
			const along = tt * 9;
			const across = o / (bandUnit * 0.05);
			const fil = fbm(along + 3, across + 17, 4);
			lum *= 1 - 0.6 * Math.max(0, (fil - 0.58) / 0.42) * band;
			lum = Math.max(0, lum);
			dens[py * gw + px] = Math.min(1, lum);
			// 색: 어두우면 보랏빛, 밝으면 희게, 중심부(아래쪽)는 따뜻하게
			const warm = Math.pow(tc, 2.2) * Math.min(1, lum * 1.3);
			const cr = 120 + 100 * Math.min(1, lum) + 60 * warm;
			const cg = 115 + 90 * Math.min(1, lum) + 25 * warm;
			const cb = 200 + 40 * Math.min(1, lum) - 40 * warm;
			const k = (py * gw + px) * 4;
			img.data[k] = Math.min(255, cr);
			img.data[k + 1] = Math.min(255, cg);
			img.data[k + 2] = Math.max(0, Math.min(255, cb));
			img.data[k + 3] = Math.min(255, lum * 160);
		}
	}
	octx.putImageData(img, 0, 0);
	return { off, dens, gw, gh, S };
}

/**
 * 장면 A(언덕): 시안 sceneA 그리기 코드 그대로. 바뀐 점: 화면 밖 캔버스 · 청록 원 없음 · 아래 설명 글자 없음 ·
 * 사람과 망원경은 망원경이 시리우스로 도는 움직임을 위해 drawFigure 로 분리(모양 코드는 그대로)
 * 넓은 화면: unit(언덕 구도 폭, 모바일은 w) 으로 언덕 · 은하수 굵기를 잡고, s(크기 배율, 상한)로 별 · 글자를 키운다. 별 개수는 넓어진 만큼 늘린다
 */
export function buildSceneA(w: number, h: number, unit: number, s: number): HTMLCanvasElement {
	const canvasA = makeCanvas(w, h);
	const ctx = context2d(canvasA);
	const bandUnit = Math.sqrt(w * unit); // 은하수 굵기 · 무늬 크기 단위(모바일은 w)
	const areaScale = Math.max(1, w / unit); // 넓어진 하늘만큼 별 개수 배율(모바일 1)
	const hillX = (f: number): number => w / 2 + (f - 0.5) * unit; // 언덕 구도 가로 위치(모바일은 w * f)
	const r = rng(7);
	// 시안은 이 자리에서 gauss 를 만들기만 하고 쓰지 않는다(난수 소비 없음)
	const horizon = h * 0.84;
	const sky = ctx.createLinearGradient(0, 0, 0, horizon);
	sky.addColorStop(0, '#02030a');
	sky.addColorStop(0.55, '#070b22');
	sky.addColorStop(0.85, '#161a3c');
	sky.addColorStop(1, '#2a2650');
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, w, h);

	// 은하수: 백조자리(데네브)에서 지평선 쪽 궁수자리 중심부로 갈수록 넓고 밝고 따뜻해진다
	const { off, dens, gw, gh, S } = milkyWay(w, h, horizon, bandUnit, r);
	ctx.save();
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.globalCompositeOperation = 'lighter';
	ctx.filter = `blur(${1.2 * s}px)`;
	ctx.drawImage(off, 0, 0, gw * S, gh * S);
	ctx.filter = 'none';
	// 은하수 속 잔별: 밀도장을 따라 뿌림(먼지 띠 안에는 거의 없음)
	let placed = 0;
	for (let i = 0; i < 140000 * areaScale && placed < 16000 * areaScale; i += 1) {
		const x = r() * w;
		const y = r() * horizon;
		const d = dens[((y / S) | 0) * gw + ((x / S) | 0)] || 0;
		if (r() > d * 0.9) continue;
		placed += 1;
		const z = (0.35 + Math.pow(r(), 3) * 0.9) * s;
		ctx.fillStyle = `rgba(235,230,255,${0.12 + r() * 0.35})`;
		ctx.fillRect(x, y, z, z);
	}
	ctx.restore();
	for (let i = 0; i < Math.round(650 * areaScale); i += 1) {
		const m = Math.pow(r(), 3.6);
		star(
			ctx,
			r() * w,
			r() * horizon * 0.97,
			(0.3 + m * 1.3) * s,
			TINTS[(r() * TINTS.length) | 0],
			m > 0.85 ? 4 : 0
		);
	}
	const named: Record<'vega' | 'deneb' | 'altair', [number, number]> = {
		vega: [w * 0.22, h * 0.19],
		deneb: [w * 0.8, h * 0.13],
		altair: [w * 0.3, h * 0.6]
	};
	const namedSize = { vega: 2.8, deneb: 2.4, altair: 2.4 };
	(
		[
			['vega', '#e6eeff'],
			['deneb', '#f1f4ff'],
			['altair', '#fff8ea']
		] as const
	).forEach(([k, c]) => star(ctx, named[k][0], named[k][1], namedSize[k] * s, c, NAMED_GLOW));
	ctx.font = `${NAMED_FONT * s}px system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif`;
	ctx.fillStyle = 'rgba(200,210,235,.6)';
	ctx.textAlign = 'center';
	// 이름표는 번짐(반지름 크기 × NAMED_GLOW) 밖에: 기준선을 번짐 끝 + 여백 + 글자 한 칸(글자 윗선이 기준선 위 1em 안) 아래에 둔다(STEP 110 S3)
	const labelY = (k: 'vega' | 'deneb' | 'altair'): number =>
		named[k][1] + (namedSize[k] * NAMED_GLOW + NAMED_LABEL_GAP + NAMED_FONT) * s;
	ctx.fillText('베가', named.vega[0], labelY('vega'));
	ctx.fillText('데네브', named.deneb[0], labelY('deneb'));
	ctx.fillText('알타이르', named.altair[0], labelY('altair'));

	// 지평선 빛 · 언덕
	const hg = ctx.createLinearGradient(0, horizon - h * 0.14, 0, horizon);
	hg.addColorStop(0, 'rgba(90,80,150,0)');
	hg.addColorStop(1, 'rgba(120,105,170,.22)');
	ctx.fillStyle = hg;
	ctx.fillRect(0, horizon - h * 0.14, w, h * 0.14);
	const hillTop = horizon - h * 0.045;
	const hill = new Path2D();
	hill.moveTo(0, h);
	hill.lineTo(0, horizon + h * 0.02);
	// 넓은 화면: 언덕 구도(unit 폭)는 가운데에, 양옆은 낮은 들판으로 잇는다(모바일은 hillX(0) = 0, hillX(1) = w 라 추가 선분이 없다)
	if (hillX(0) > 0.5) hill.lineTo(hillX(0), horizon + h * 0.02);
	hill.bezierCurveTo(hillX(0.3), horizon - h * 0.005, hillX(0.5), hillTop, hillX(0.66), hillTop);
	hill.bezierCurveTo(
		hillX(0.84),
		hillTop,
		hillX(0.95),
		horizon - h * 0.01,
		hillX(1),
		horizon + h * 0.005
	);
	if (hillX(1) < w - 0.5) hill.lineTo(w, horizon + h * 0.005);
	hill.lineTo(w, h);
	hill.closePath();
	const hf = ctx.createLinearGradient(0, hillTop, 0, h);
	hf.addColorStop(0, '#07081a');
	hf.addColorStop(0.3, '#03040c');
	hf.addColorStop(1, '#010207');
	ctx.fillStyle = hf;
	ctx.fill(hill);
	ctx.save();
	ctx.clip(hill);
	ctx.strokeStyle = 'rgba(150,140,210,.28)';
	ctx.lineWidth = 1.4 * s;
	ctx.translate(0, 0.6 * s);
	ctx.stroke(hill);
	ctx.restore();
	return canvasA;
}

type Point = [number, number];

/** SD 사람 · 망원경: 시안 코드 그대로, 망원경 각도(ang)와 언덕 구도 폭(unit, 모바일은 w)만 인자로 받는다 */
export function drawFigure(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	s: number,
	ang: number,
	unit: number
): void {
	const horizon = h * 0.84;
	const hillTop = horizon - h * 0.045;
	// SD 사람 · 망원경(실루엣 + 하늘빛 가장자리). 단위 u, 발 중심 (fx, ground), 위가 음수
	const ground = hillTop + 1 * s;
	const u = 1.55 * s;
	const fx = w / 2 + 0.2 * unit; // 모바일 w * 0.7, 넓은 화면은 가운데 근처
	const ink = '#020309';
	const rim = 'rgba(175,170,235,.6)';
	// 선 끝 · 꺾임 모양을 바꾸므로 함수 밖으로 새지 않게 감싼다(바탕 상태는 initDrawingState)
	ctx.save();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	const P = (x: number, y: number): Point => [fx + x * u, ground + y * u];
	const tx = fx - 30 * u;
	const head: Point = [tx, ground - 30 * u];
	const c = Math.cos(ang);
	const sn = Math.sin(ang);
	const T = (lx: number, ly: number): Point => [
		head[0] + (lx * c - ly * sn) * u * 0.95,
		head[1] + (lx * sn + ly * c) * u * 0.95
	];
	const tube = new Path2D();
	tube.moveTo(...T(-14, -5.5));
	tube.lineTo(...T(22, -6.5));
	tube.lineTo(...T(22, 6.5));
	tube.lineTo(...T(-14, 5.5));
	tube.closePath();
	tube.moveTo(...T(20, -8.5));
	tube.lineTo(...T(32, -8.5));
	tube.lineTo(...T(32, 8.5));
	tube.lineTo(...T(20, 8.5));
	tube.closePath();
	tube.moveTo(...T(-20, -3));
	tube.lineTo(...T(-13, -3));
	tube.lineTo(...T(-13, 3));
	tube.lineTo(...T(-20, 3));
	tube.closePath();
	tube.moveTo(head[0] + 4.5 * u, head[1]);
	tube.arc(...head, 4.5 * u, 0, Math.PI * 2);
	const body = new Path2D();
	const E = (x: number, y: number, rx: number, ry: number): void => {
		const [px, py] = P(x, y);
		body.moveTo(px + rx * u, py);
		body.ellipse(px, py, rx * u, ry * u, 0, 0, Math.PI * 2);
	};
	E(-4.5, -2.5, 5.5, 3);
	E(5, -2.5, 5.5, 3); // 발
	body.moveTo(...P(-10, -5));
	body.quadraticCurveTo(...P(-11, -20), ...P(-7, -27)); // 외투
	body.lineTo(...P(7, -27));
	body.quadraticCurveTo(...P(11, -20), ...P(10, -5));
	body.closePath();
	E(-1, -41, 14.5, 13.5); // 큰 머리
	{
		const [px, py] = P(-1, -48);
		body.moveTo(px - 14 * u, py);
		body.ellipse(px, py, 14 * u, 10 * u, 0, Math.PI, Math.PI * 2);
		body.closePath();
	} // 털모자
	E(-1, -59.5, 4, 4); // 방울
	const grip = T(-16, 0);
	// 실루엣 전체를 한 번에: 하늘빛으로 살짝 위·왼쪽에 먼저 그리고, 그 위에 검정 — 바깥 테두리에만 빛이 남는다
	const figure = (color: string, dx: number, dy: number): void => {
		ctx.save();
		ctx.translate(dx, dy);
		ctx.fillStyle = color;
		ctx.strokeStyle = color;
		ctx.lineWidth = 2.6 * u;
		(
			[
				[-13, 0],
				[12, 0],
				[1, 3]
			] as const
		).forEach(([ox, oy]) => {
			ctx.beginPath();
			ctx.moveTo(...head);
			ctx.lineTo(tx + ox * u, ground + oy * u);
			ctx.stroke();
		});
		ctx.fill(tube, 'nonzero');
		ctx.fill(body, 'nonzero');
		ctx.lineWidth = 4.6 * u;
		ctx.beginPath();
		ctx.moveTo(...P(-6, -23));
		ctx.quadraticCurveTo(...P(-14, -22), grip[0] + 2 * u, grip[1] + 1 * u);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(...P(7, -23));
		ctx.quadraticCurveTo(...P(13, -18), ...P(14, -12));
		ctx.stroke();
		ctx.restore();
	};
	figure(rim, -1.3 * s, -1.3 * s);
	figure(ink, 0, 0);
	const lamp = P(15, -11);
	const lg = ctx.createRadialGradient(...lamp, 0, ...lamp, 26 * s);
	lg.addColorStop(0, 'rgba(255,70,60,.6)');
	lg.addColorStop(0.25, 'rgba(255,60,50,.2)');
	lg.addColorStop(1, 'rgba(255,60,50,0)');
	ctx.fillStyle = lg;
	ctx.beginPath();
	ctx.arc(...lamp, 26 * s, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#ff6a5a';
	ctx.beginPath();
	ctx.arc(...lamp, 1.6 * s, 0, Math.PI * 2);
	ctx.fill();
	const pool = ctx.createRadialGradient(
		lamp[0] + 4 * s,
		ground + 2 * s,
		0,
		lamp[0] + 4 * s,
		ground + 2 * s,
		30 * s
	);
	pool.addColorStop(0, 'rgba(255,60,50,.14)');
	pool.addColorStop(1, 'rgba(255,60,50,0)');
	ctx.fillStyle = pool;
	ctx.beginPath();
	ctx.ellipse(lamp[0] + 4 * s, ground + 3 * s, 30 * s, 6 * s, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

/** 망원경 머리에서 시리우스를 향하는 각도(시안 좌표 그대로 계산) */
export function telescopeAimAngle(
	w: number,
	h: number,
	s: number,
	unit: number,
	siriusX: number
): number {
	const u = 1.55 * s;
	const ground = h * 0.84 - h * 0.045 + 1 * s;
	const headX = w / 2 + 0.2 * unit - 30 * u;
	const headY = ground - 30 * u;
	return Math.atan2(HILL_SIRIUS.fy * h - headY, siriusX - headX);
}

/**
 * 하늘 별밭(대상 사이를 오가는 바탕): 시안 sceneB 의 별밭 생성 방식, 대상은 실시간으로 따로 그림
 * 넓은 화면: s(별 크기 배율, 상한)는 언덕과 같고, 넓어진 만큼(areaScale) 별 · 성운 얼룩 개수를 늘려 빈 곳이 없게 한다
 */
export function buildSky(w: number, h: number, s: number, areaScale: number): HTMLCanvasElement {
	const canvasSky = makeCanvas(w, h);
	const ctx = context2d(canvasSky);
	const r = rng(1844);
	const gauss = gaussOf(r);
	const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, h * 0.7);
	g.addColorStop(0, '#0a1028');
	g.addColorStop(0.6, '#060a1c');
	g.addColorStop(1, '#03050c');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, w, h);
	ctx.globalCompositeOperation = 'lighter';
	for (let i = 0; i < Math.round(200 * areaScale); i += 1) {
		const x = w * (0.55 + gauss() * 0.35);
		const y = h * (0.45 + gauss() * 0.3);
		const rr = (30 + r() * 90) * s;
		const n = ctx.createRadialGradient(x, y, 0, x, y, rr);
		n.addColorStop(
			0,
			`rgba(${(90 + r() * 60) | 0},${(80 + r() * 40) | 0},${(150 + r() * 60) | 0},.03)`
		);
		n.addColorStop(1, 'rgba(0,0,0,0)');
		ctx.fillStyle = n;
		ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
	}
	ctx.globalCompositeOperation = 'source-over';
	for (let i = 0; i < Math.round(3600 * areaScale); i += 1) {
		const m = Math.pow(r(), 4.2);
		const size = (0.25 + m * 1.5) * s;
		ctx.globalAlpha = (0.3 + m * 0.7) * 0.55;
		star(ctx, r() * w, r() * h, size, TINTS[(r() * TINTS.length) | 0], m > 0.9 ? 4 : 0);
	}
	ctx.globalAlpha = 1;
	return canvasSky;
}

/** 6장 켜지는 점 모양: 크기 · 밝기 통일, 은은한 번짐 1단계(심 + 번짐 하나) */
export function makeLitSprite(core: string, glow: string): HTMLCanvasElement {
	const size = 32;
	const c = makeCanvas(size, size);
	const g = context2d(c);
	const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	grad.addColorStop(0, core);
	grad.addColorStop(0.26, core);
	grad.addColorStop(0.36, glow);
	grad.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, size, size);
	return c;
}
