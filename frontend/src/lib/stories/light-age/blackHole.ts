// 종점 블랙홀(Canvas 2D, 코드로 그린 상상도): 검은 그림자 · 얇은 빛 고리 · 기울어진 강착 원반 · 그림자 위아래로 휘어 보이는 원반 뒷면(중력 렌즈 근사).
// 과학 시각화에서 흔히 쓰는 일반 형태를 단순한 도형으로 근사한다. 길이 단위는 그림자 반지름(1).
// 움직이지 않는 빛 번짐 · 원반 · 고리는 오프스크린 캔버스 두 장(그림자 아래 · 위)에 한 번 그려 두고, 매 프레임은 흐르는 호 조각만 그린다.

// 그림자 반지름 1 기준 크기
const DISK_INNER = 1.3;
const DISK_OUTER = 4.4;
// 원반을 거의 옆에서 본다: 세로 납작함
const DISK_SQUASH = 0.13;
// 화면에 대해 기운 각도(라디안)
const TILT = -0.2;
// 원반 뒷면이 그림자 위로 휘어 보이는 띠(위) · 아래로 휘어 보이는 얇은 띠
const UPPER_ARC_INNER = 1.04;
const UPPER_ARC_OUTER = 2.1;
const LOWER_ARC_INNER = 1.04;
const LOWER_ARC_OUTER = 1.24;
const PHOTON_RING_RADIUS = 1.03;
const GLOW_OUTER = 3;
// 오프스크린 캔버스 범위(반 너비 · 반 높이)
const CACHE_HALF_WIDTH = 4.8;
const CACHE_HALF_HEIGHT = 3;
// 한쪽이 더 밝은 비대칭: 오른쪽 끝 밝기(왼쪽 끝 1 대비)
const DIM_SIDE_ALPHA = 0.3;
// 흐름: 안쪽 가장자리 각속도(라디안/초), 바깥으로 갈수록 반지름^1.5 에 반비례해 느려진다.
const INNER_ANGULAR_SPEED = 0.9;
const ORBIT_POWER = 1.5;
// 호 조각 길이(라디안)와 굵기(CSS px)
const PIECE_MIN = 0.12;
const PIECE_MAX = 0.4;
const PIECE_WIDTH_PX = 1.4;
// 위쪽 휜 띠 위 입자 비율
const ARC_PARTICLE_SHARE = 0.25;

const DISK_RGB = '255, 196, 128';
const HOT_RGB = '255, 236, 200';
const RING_RGB = '255, 244, 225';

const FULL_TURN = Math.PI * 2;
const HALF_TURN = Math.PI;

type Piece = { radius: number; angle: number; length: number; brightness: number; onArc: boolean };

function random(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

/** 각도별 밝기: 왼쪽(다가오는 쪽)이 밝고 오른쪽이 어둡다. */
function beaming(angle: number): number {
	const towardLeft = (1 - Math.cos(angle)) / 2;
	return 0.3 + 0.7 * towardLeft;
}

function isFront(angle: number): boolean {
	// 캔버스 좌표(y 아래)에서 sin > 0 이면 원반 앞쪽(그림자 앞을 지나는 아래 반)
	return Math.sin(angle) > 0;
}

function halfAnnulus(
	context: CanvasRenderingContext2D,
	inner: number,
	outer: number,
	from: number
): void {
	context.beginPath();
	context.arc(0, 0, outer, from, from + HALF_TURN);
	context.arc(0, 0, inner, from + HALF_TURN, from, true);
	context.closePath();
}

/** 한쪽이 더 밝게: 칠한 띠에 왼쪽 → 오른쪽으로 옅어지는 가림(destination-in)을 씌운다. */
function dimRightSide(context: CanvasRenderingContext2D, extent: number): void {
	const mask = context.createLinearGradient(-extent, 0, extent, 0);
	mask.addColorStop(0, 'rgba(0, 0, 0, 1)');
	mask.addColorStop(1, `rgba(0, 0, 0, ${DIM_SIDE_ALPHA})`);
	context.globalCompositeOperation = 'destination-in';
	context.fillStyle = mask;
	context.fillRect(
		-CACHE_HALF_WIDTH * 2,
		-CACHE_HALF_WIDTH * 2,
		CACHE_HALF_WIDTH * 4,
		CACHE_HALF_WIDTH * 4
	);
	context.globalCompositeOperation = 'source-over';
}

function bandGradient(
	context: CanvasRenderingContext2D,
	inner: number,
	outer: number,
	strength: number
): CanvasGradient {
	const gradient = context.createRadialGradient(0, 0, inner, 0, 0, outer);
	gradient.addColorStop(0, `rgba(${HOT_RGB}, ${strength})`);
	gradient.addColorStop(0.35, `rgba(${DISK_RGB}, ${strength * 0.7})`);
	gradient.addColorStop(1, `rgba(${DISK_RGB}, 0)`);
	return gradient;
}

/** 원반 반쪽(front 면 아래 반, 아니면 위 반). 좌표계는 원반 평면(납작하게 하기 전). */
function paintDiskHalf(context: CanvasRenderingContext2D, front: boolean): void {
	context.save();
	context.scale(1, DISK_SQUASH);
	context.fillStyle = bandGradient(context, DISK_INNER, DISK_OUTER, 0.95);
	halfAnnulus(context, DISK_INNER, DISK_OUTER, front ? 0 : HALF_TURN);
	context.fill();
	context.restore();
}

/** 그림자 둘레로 휜 띠(upper 면 위 반, 아니면 아래 반). */
function paintLensedArc(context: CanvasRenderingContext2D, upper: boolean): void {
	const inner = upper ? UPPER_ARC_INNER : LOWER_ARC_INNER;
	const outer = upper ? UPPER_ARC_OUTER : LOWER_ARC_OUTER;
	context.fillStyle = bandGradient(context, inner, outer, upper ? 1 : 0.5);
	halfAnnulus(context, inner, outer, upper ? HALF_TURN : 0);
	context.fill();
}

function paintGlow(context: CanvasRenderingContext2D): void {
	const glow = context.createRadialGradient(0, 0, 1, 0, 0, GLOW_OUTER);
	glow.addColorStop(0, `rgba(${DISK_RGB}, 0.32)`);
	glow.addColorStop(1, `rgba(${DISK_RGB}, 0)`);
	context.fillStyle = glow;
	context.fillRect(-GLOW_OUTER, -GLOW_OUTER, GLOW_OUTER * 2, GLOW_OUTER * 2);
}

function paintPhotonRing(context: CanvasRenderingContext2D, unitPx: number): void {
	context.save();
	context.strokeStyle = `rgba(${RING_RGB}, 0.95)`;
	context.shadowColor = `rgba(${RING_RGB}, 0.9)`;
	context.shadowBlur = unitPx * 0.12;
	context.lineWidth = 0.035;
	context.beginPath();
	context.arc(0, 0, PHOTON_RING_RADIUS, 0, FULL_TURN);
	context.stroke();
	context.restore();
}

export class BlackHole {
	// 그림자 아래(빛 번짐 · 원반 뒷면) / 그림자 위(휜 띠 · 빛 고리 · 원반 앞면)
	private under: HTMLCanvasElement | null = null;
	private over: HTMLCanvasElement | null = null;
	private unitPx = 0;
	private pieces: Piece[] = [];

	/** 그림자 반지름 unitPx(CSS px) · 픽셀 배율로 고정 부분을 다시 그리고 입자 count 개를 만든다. */
	prepare(unitPx: number, pixelRatio: number, count: number): void {
		this.unitPx = unitPx;
		this.under = this.paintLayer(pixelRatio, [
			(context) => paintGlow(context),
			(context) => paintDiskHalf(context, false)
		]);
		this.over = this.paintLayer(pixelRatio, [
			(context) => paintLensedArc(context, true),
			(context) => paintPhotonRing(context, unitPx * pixelRatio),
			(context) => paintLensedArc(context, false),
			(context) => paintDiskHalf(context, true)
		]);
		this.pieces = Array.from({ length: count }, (_, index) =>
			this.newPiece(index < count * ARC_PARTICLE_SHARE)
		);
	}

	/** 호 조각을 궤도를 따라 흘린다. */
	step(seconds: number): void {
		for (const piece of this.pieces) {
			const orbitRadius = piece.onArc ? DISK_INNER : piece.radius;
			piece.angle += INNER_ANGULAR_SPEED * (DISK_INNER / orbitRadius) ** ORBIT_POWER * seconds;
			if (piece.onArc && piece.angle > FULL_TURN) piece.angle -= HALF_TURN;
			if (!piece.onArc && piece.angle > FULL_TURN) piece.angle -= FULL_TURN;
		}
	}

	/**
	 * 중심 (centerX, centerY) · 그림자 반지름 radius(CSS px)로 그린다. alpha 는 그림자 밖 빛(원반 · 고리)의 세기:
	 * 끝 장에서 그림자가 화면을 덮어 갈 때 빛을 줄여 마지막에 검은 화면만 남긴다.
	 */
	draw(
		context: CanvasRenderingContext2D,
		centerX: number,
		centerY: number,
		radius: number,
		alpha: number
	): void {
		if (this.under === null || this.over === null || this.unitPx <= 0) return;
		const scale = radius / this.unitPx;
		context.save();
		context.globalAlpha = alpha;
		this.drawLayer(context, this.under, centerX, centerY, scale);
		this.drawPieces(context, centerX, centerY, radius, false);
		context.globalAlpha = 1;
		context.fillStyle = '#000';
		context.beginPath();
		context.arc(centerX, centerY, radius, 0, FULL_TURN);
		context.fill();
		context.globalAlpha = alpha;
		this.drawLayer(context, this.over, centerX, centerY, scale);
		this.drawPieces(context, centerX, centerY, radius, true);
		context.restore();
	}

	/** 화면 점(CSS px)이 원반 또는 그림자 둘레 띠 안이면 true: 빛줄기가 여기서 빨려 들어가 사라진다. */
	contains(x: number, y: number, centerX: number, centerY: number, radius: number): boolean {
		if (radius <= 0) return false;
		const dx = (x - centerX) / radius;
		const dy = (y - centerY) / radius;
		// 기운 만큼 되돌려 원반 평면 좌표로
		const localX = dx * Math.cos(-TILT) - dy * Math.sin(-TILT);
		const localY = dx * Math.sin(-TILT) + dy * Math.cos(-TILT);
		if (Math.hypot(localX, localY) < UPPER_ARC_OUTER) return true;
		return (localX / DISK_OUTER) ** 2 + (localY / (DISK_OUTER * DISK_SQUASH)) ** 2 < 1;
	}

	private newPiece(onArc: boolean): Piece {
		const inner = onArc ? UPPER_ARC_INNER : DISK_INNER;
		const outer = onArc ? UPPER_ARC_OUTER * 0.85 : DISK_OUTER * 0.8;
		// 안쪽에 더 많이(밝은 쪽에 몰리게)
		const radius = inner + (outer - inner) * Math.random() ** 1.6;
		return {
			radius,
			angle: onArc ? random(HALF_TURN, FULL_TURN) : random(0, FULL_TURN),
			length: random(PIECE_MIN, PIECE_MAX),
			brightness: random(0.45, 1),
			onArc
		};
	}

	/** 그림 하나하나를 따로 칠하고 한쪽을 옅게 한 뒤 차례로 겹친다(뒤 그림의 가림이 앞 그림에 겹쳐 걸리지 않게). */
	private paintLayer(
		pixelRatio: number,
		paints: Array<(context: CanvasRenderingContext2D) => void>
	): HTMLCanvasElement {
		const layer = this.blankLayer(pixelRatio);
		const layerContext = layer.getContext('2d');
		if (layerContext === null) throw new Error('canvas 2d context unavailable');
		for (const paint of paints) {
			const part = this.blankLayer(pixelRatio);
			const context = this.unitContext(part, pixelRatio);
			paint(context);
			dimRightSide(context, CACHE_HALF_WIDTH);
			layerContext.drawImage(part, 0, 0);
		}
		return layer;
	}

	private blankLayer(pixelRatio: number): HTMLCanvasElement {
		const layer = document.createElement('canvas');
		const unit = this.unitPx * pixelRatio;
		layer.width = Math.ceil(CACHE_HALF_WIDTH * 2 * unit);
		layer.height = Math.ceil(CACHE_HALF_HEIGHT * 2 * unit);
		return layer;
	}

	/** 가운데가 원점 · 그림자 반지름이 1 · 원반 기울기만큼 돌린 좌표계 */
	private unitContext(layer: HTMLCanvasElement, pixelRatio: number): CanvasRenderingContext2D {
		const context = layer.getContext('2d');
		if (context === null) throw new Error('canvas 2d context unavailable');
		const unit = this.unitPx * pixelRatio;
		context.translate(layer.width / 2, layer.height / 2);
		context.scale(unit, unit);
		context.rotate(TILT);
		return context;
	}

	private drawLayer(
		context: CanvasRenderingContext2D,
		layer: HTMLCanvasElement,
		centerX: number,
		centerY: number,
		scale: number
	): void {
		const width = CACHE_HALF_WIDTH * 2 * this.unitPx * scale;
		const height = CACHE_HALF_HEIGHT * 2 * this.unitPx * scale;
		context.drawImage(layer, centerX - width / 2, centerY - height / 2, width, height);
	}

	/** front: 원반 앞면 · 위쪽 휜 띠의 조각(그림자 위) / 아니면 원반 뒷면 조각(그림자 아래, 그림자에 가려짐). */
	private drawPieces(
		context: CanvasRenderingContext2D,
		centerX: number,
		centerY: number,
		radius: number,
		front: boolean
	): void {
		const baseAlpha = context.globalAlpha;
		context.save();
		context.translate(centerX, centerY);
		context.rotate(TILT);
		context.scale(radius, radius);
		context.lineWidth = PIECE_WIDTH_PX / radius;
		context.lineCap = 'round';
		for (const piece of this.pieces) {
			const visibleHere = piece.onArc || isFront(piece.angle) ? front : !front;
			if (!visibleHere) continue;
			context.globalAlpha = baseAlpha * piece.brightness * beaming(piece.angle);
			context.strokeStyle = `rgb(${HOT_RGB})`;
			context.beginPath();
			if (piece.onArc) {
				context.arc(0, 0, piece.radius, piece.angle, piece.angle + piece.length);
			} else {
				context.ellipse(
					0,
					0,
					piece.radius,
					piece.radius * DISK_SQUASH,
					0,
					piece.angle,
					piece.angle + piece.length
				);
			}
			context.stroke();
		}
		context.restore();
	}
}
