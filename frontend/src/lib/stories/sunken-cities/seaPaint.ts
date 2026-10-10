// 바다 밑의 도시들 배경 윤곽 그리기(Canvas 2D): 장마다 바닥에 놓이는 윤곽(고리 도시 · 돌담 · 땅 · 골목 · 모자이크 · 석상 · 항구 · 조립).
// 좌표는 윤곽 기준점(가운데 x · 바닥 y)과 단위(u = 윤곽 폭 / 100)로 잡는다. 사람 · 그림자는 상상 장면이라 장 카드에 "상상"으로 표시한다(3 · 4장).
// 조립(8장)은 1장 고리 도시 그림을 다시 그리는 연출이다.

export type OutlineId =
	'none' | 'rings' | 'walls' | 'land' | 'alleys' | 'mosaic' | 'statue' | 'harbor' | 'assemble';

export type Geometry = {
	centerX: number;
	floorY: number;
	// 윤곽 단위(px)
	unit: number;
	// 지금 수면 높이(px). 땅 · 항구 장면에서 물 위 / 아래를 가른다.
	surfaceY: number;
};

export type PaintFrame = {
	context: CanvasRenderingContext2D;
	geometry: Geometry;
	alpha: number;
	// 시그니처 진행도(0~1): 땅 장면은 물이 차오른 정도, 골목은 돌이 벽으로 이어진 정도, 항구는 기운 정도, 조립은 모인 정도
	signature: number;
	seconds: number;
	still: boolean;
};

// 윤곽 선 색(밝은 청록) · 전설 고리 성벽 색(청동 · 주석 · 오레이칼코스)
const LINE_RGB = '170, 230, 225';
const WALL_COLORS = ['205, 150, 90', '190, 200, 210', '235, 110, 80'] as const;
const LAND_RGB = '58, 74, 52';
const SHADOW_RGB = '8, 20, 26';
const MOSAIC_COLORS = ['70, 130, 130', '150, 120, 80', '40, 80, 90'] as const;
const FULL_TURN = Math.PI * 2;
// 고리 도시: 바깥 → 안 반지름(u)과 비스듬히 본 납작함
const RING_RADII = [48, 36, 24, 12] as const;
const RING_FLATNESS = 0.28;
// 땅(도거랜드): 언덕 높이 · 폭(u), 사람 자리(u)
const HILL_HEIGHT = 40;
const HILL_SPREAD = 30;
const PEOPLE_X = [-7, -1, 5] as const;
// 항구(포트로열): 다 기울었을 때 각도(라디안)
export const HARBOR_TILT_RAD = -0.22;
// 조립: 조각 수
const ASSEMBLE_PIECES = 28;
// 골목(파블로페트리): 흩어진 돌 하나의 길이(벽 길이 비율) · 흩어진 거리(u)
const STONE_SHARE = 0.3;
const STONE_SCATTER_UNITS = 8;

function stroke(frame: PaintFrame, rgb: string, alphaScale = 1): void {
	frame.context.strokeStyle = `rgba(${rgb}, ${frame.alpha * alphaScale})`;
}

function fill(frame: PaintFrame, rgb: string, alphaScale = 1): void {
	frame.context.fillStyle = `rgba(${rgb}, ${frame.alpha * alphaScale})`;
}

/** 간단한 결정적 흔들림(같은 i 는 같은 값) */
function jitter(index: number, salt: number): number {
	const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
	return value - Math.floor(value) - 0.5;
}

function ringCenterY(geometry: Geometry): number {
	return geometry.floorY - 2 * geometry.unit;
}

function paintRings(frame: PaintFrame): void {
	const { context, geometry } = frame;
	const u = geometry.unit;
	const cy = ringCenterY(geometry);
	RING_RADII.forEach((radius, index) => {
		context.beginPath();
		context.ellipse(geometry.centerX, cy, radius * u, radius * u * RING_FLATNESS, 0, 0, FULL_TURN);
		// 물 고리와 땅 고리가 번갈아
		fill(frame, index % 2 === 0 ? LAND_RGB : LINE_RGB, index % 2 === 0 ? 0.55 : 0.12);
		context.fill();
		stroke(frame, index < WALL_COLORS.length ? WALL_COLORS[index] : LINE_RGB, 0.9);
		context.lineWidth = 1.5;
		context.stroke();
	});
	paintTemple(frame, geometry.centerX, cy);
}

function paintTemple(frame: PaintFrame, x: number, baseY: number): void {
	const { context } = frame;
	const u = frame.geometry.unit;
	context.beginPath();
	context.rect(x - 4 * u, baseY - 7 * u, 8 * u, 6 * u);
	context.moveTo(x - 5 * u, baseY - 7 * u);
	context.lineTo(x, baseY - 10 * u);
	context.lineTo(x + 5 * u, baseY - 7 * u);
	stroke(frame, WALL_COLORS[2]);
	context.lineWidth = 1.5;
	context.stroke();
}

/** 바닥 평면 위 점: 가로 위치(-1~1) · 깊이(0 먼 쪽 ~ 1 가까운 쪽) → 화면 좌표(원근) */
function floorPoint(geometry: Geometry, across: number, depth: number): [number, number] {
	const u = geometry.unit;
	const spread = 30 + 22 * depth;
	return [geometry.centerX + across * spread * u, geometry.floorY - 10 * u + depth * 18 * u];
}

function paintWalls(frame: PaintFrame): void {
	const { context, geometry } = frame;
	context.lineWidth = 1.5;
	stroke(frame, LINE_RGB, 0.75);
	const rows = 5;
	const columns = 6;
	for (let row = 0; row <= rows; row += 1) {
		context.beginPath();
		for (let step = 0; step <= columns; step += 1) {
			const [x, y] = floorPoint(geometry, -1 + (2 * step) / columns, row / rows);
			const wobble = jitter(row * 10 + step, 1) * geometry.unit * 1.5;
			if (step === 0) context.moveTo(x, y + wobble);
			else context.lineTo(x, y + wobble);
		}
		context.stroke();
	}
	for (let step = 0; step <= columns; step += 1) {
		context.beginPath();
		const across = -1 + (2 * step) / columns + jitter(step, 2) * 0.15;
		context.moveTo(...floorPoint(geometry, across, 0));
		context.lineTo(...floorPoint(geometry, across, 1));
		context.stroke();
	}
}

function hillY(geometry: Geometry, x: number): number {
	const u = geometry.unit;
	const offset = (x - geometry.centerX) / (HILL_SPREAD * u);
	return geometry.floorY - HILL_HEIGHT * u * Math.exp(-offset * offset);
}

/** 땅(도거랜드) 언덕과 언덕 위 사람들(상상). 물에 잠긴 사람은 사라진다. */
function paintLand(frame: PaintFrame, left: number, right: number): void {
	const { context, geometry } = frame;
	context.beginPath();
	context.moveTo(left, geometry.floorY);
	for (let x = left; x <= right; x += 4) context.lineTo(x, hillY(geometry, x));
	context.lineTo(right, geometry.floorY);
	context.closePath();
	fill(frame, LAND_RGB, 0.95);
	context.fill();
	stroke(frame, LINE_RGB, 0.6);
	context.lineWidth = 1.5;
	context.stroke();
	for (const offset of PEOPLE_X) {
		const x = geometry.centerX + offset * geometry.unit;
		const feetY = hillY(geometry, x);
		const above = geometry.surfaceY - feetY;
		if (above > 0) paintPerson(frame, x, feetY, Math.min(1, above / (4 * geometry.unit)));
	}
}

function paintPerson(frame: PaintFrame, x: number, feetY: number, visible: number): void {
	const { context } = frame;
	const u = frame.geometry.unit;
	fill(frame, SHADOW_RGB, visible);
	context.beginPath();
	context.arc(x, feetY - 5.2 * u, 0.9 * u, 0, FULL_TURN);
	context.fill();
	context.fillRect(x - 0.8 * u, feetY - 4.2 * u, 1.6 * u, 4.2 * u);
}

/**
 * 벽 한 줄: 시그니처 0 에서는 제자리 근처에 흩어진 짧은 돌(벽 길이의 STONE_SHARE), 1 에서는 집 윤곽의 벽 한 변.
 * 흩어진 정도는 줄마다 결정적 흔들림(jitter)으로 정한다.
 */
function paintWall(
	frame: PaintFrame,
	from: [number, number],
	to: [number, number],
	index: number
): void {
	const { context, geometry } = frame;
	const gather = frame.signature;
	const middleX = (from[0] + to[0]) / 2;
	const middleY = (from[1] + to[1]) / 2;
	const offsetX = jitter(index, 5) * STONE_SCATTER_UNITS * geometry.unit * (1 - gather);
	const offsetY = jitter(index, 6) * STONE_SCATTER_UNITS * 0.5 * geometry.unit * (1 - gather);
	const reach = STONE_SHARE + (1 - STONE_SHARE) * gather;
	context.beginPath();
	context.moveTo(
		middleX + offsetX + (from[0] - middleX) * reach,
		middleY + offsetY + (from[1] - middleY) * reach
	);
	context.lineTo(
		middleX + offsetX + (to[0] - middleX) * reach,
		middleY + offsetY + (to[1] - middleY) * reach
	);
	context.stroke();
}

/** 골목(파블로페트리): 흩어진 돌이 시그니처 진행도를 따라 벽 줄로 이어져 골목 · 집 윤곽이 된다. */
function paintAlleys(frame: PaintFrame): void {
	const { context, geometry } = frame;
	context.lineWidth = 1.2;
	stroke(frame, LINE_RGB, 0.75);
	const rows = 4;
	const columns = 5;
	let wallIndex = 0;
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			if ((row + column) % 4 === 1) continue;
			const across = -1 + (2 * column + 0.25) / columns;
			const width = 1.5 / columns;
			const near = (row + 0.8) / rows;
			const far = (row + 0.15) / rows;
			const corners = [
				floorPoint(geometry, across, far),
				floorPoint(geometry, across + width, far),
				floorPoint(geometry, across + width, near),
				floorPoint(geometry, across, near)
			];
			corners.forEach((corner, side) => {
				paintWall(frame, corner, corners[(side + 1) % corners.length], wallIndex);
				wallIndex += 1;
			});
		}
	}
	// 골목에 잠깐 겹치는 사람 그림자(상상): 골목이 다 드러난 뒤 몇 초에 한 번 나타났다 사라진다. 정지 화면은 옅게 둔다.
	const flicker = frame.still ? 0.4 : Math.max(0, Math.sin(frame.seconds * 0.9)) ** 3;
	const [x, y] = floorPoint(geometry, 0.08, 0.62);
	paintPerson(frame, x, y, 0.55 * flicker * frame.signature);
}

function paintMosaic(frame: PaintFrame): void {
	const { context, geometry } = frame;
	const rows = 6;
	const columns = 10;
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const across = -1 + (2 * column) / columns;
			const step = 2 / columns;
			const [x1, y1] = floorPoint(geometry, across, row / rows);
			const [x2] = floorPoint(geometry, across + step, row / rows);
			const [x3, y3] = floorPoint(geometry, across + step, (row + 1) / rows);
			const [x4] = floorPoint(geometry, across, (row + 1) / rows);
			context.beginPath();
			context.moveTo(x1, y1);
			context.lineTo(x2, y1);
			context.lineTo(x3, y3);
			context.lineTo(x4, y3);
			context.closePath();
			fill(frame, MOSAIC_COLORS[(row * 3 + column * 2) % MOSAIC_COLORS.length], 0.75);
			context.fill();
		}
	}
	paintFish(frame);
}

function paintFish(frame: PaintFrame): void {
	const { context, geometry } = frame;
	const u = geometry.unit;
	fill(frame, LINE_RGB, 0.7);
	for (let index = 0; index < 3; index += 1) {
		const travel = frame.still ? 0.3 * index : (frame.seconds * 0.05 + index * 0.33) % 1;
		const x = geometry.centerX + (travel - 0.5) * 110 * u;
		const y = geometry.floorY - (16 + index * 7) * u + Math.sin(frame.seconds + index) * u;
		context.beginPath();
		context.ellipse(x, y, 2.6 * u, 1 * u, 0, 0, FULL_TURN);
		context.moveTo(x - 2.4 * u, y);
		context.lineTo(x - 4.2 * u, y - 1.2 * u);
		context.lineTo(x - 4.2 * u, y + 1.2 * u);
		context.closePath();
		context.fill();
	}
}

function paintStatue(frame: PaintFrame): void {
	const { context, geometry } = frame;
	const u = geometry.unit;
	const x = geometry.centerX - 8 * u;
	const base = geometry.floorY;
	context.lineWidth = 1.5;
	stroke(frame, LINE_RGB, 0.85);
	fill(frame, SHADOW_RGB, 0.5);
	context.beginPath();
	// 받침 · 다리 · 몸 · 머리 수건(네메스)과 왕관
	context.rect(x - 7 * u, base - 4 * u, 14 * u, 4 * u);
	context.rect(x - 4 * u, base - 20 * u, 8 * u, 16 * u);
	context.moveTo(x - 6 * u, base - 20 * u);
	context.lineTo(x - 4.5 * u, base - 36 * u);
	context.lineTo(x + 4.5 * u, base - 36 * u);
	context.lineTo(x + 6 * u, base - 20 * u);
	context.closePath();
	context.moveTo(x - 5 * u, base - 36 * u);
	context.lineTo(x - 3 * u, base - 44 * u);
	context.lineTo(x + 3 * u, base - 44 * u);
	context.lineTo(x + 5 * u, base - 36 * u);
	context.closePath();
	context.rect(x - 1.6 * u, base - 49 * u, 3.2 * u, 5 * u);
	context.fill();
	context.stroke();
	paintStele(frame, geometry.centerX + 16 * u, base);
}

function paintStele(frame: PaintFrame, x: number, base: number): void {
	const { context } = frame;
	const u = frame.geometry.unit;
	context.beginPath();
	context.moveTo(x - 5 * u, base);
	context.lineTo(x - 5 * u, base - 18 * u);
	context.arc(x, base - 18 * u, 5 * u, Math.PI, 0);
	context.lineTo(x + 5 * u, base);
	context.closePath();
	context.fill();
	context.stroke();
	for (let line = 0; line < 4; line += 1) {
		context.beginPath();
		context.moveTo(x - 3 * u, base - (16 - line * 3) * u);
		context.lineTo(x + 3 * u, base - (16 - line * 3) * u);
		context.stroke();
	}
}

// 항구 집들: [왼쪽 x(u), 폭(u), 높이(u)]
const HARBOR_HOUSES: ReadonlyArray<[number, number, number]> = [
	[-34, 9, 12],
	[-24, 8, 16],
	[-15, 10, 11],
	[-4, 6, 26],
	[3, 9, 14],
	[13, 8, 18],
	[22, 10, 12]
];

/** 항구(포트로열): 수면 높이 모래땅 위 도시가 시그니처 진행도만큼 기울며 바닥으로 가라앉는다. */
function paintHarbor(frame: PaintFrame, restingY: number): number {
	const { context, geometry } = frame;
	const u = geometry.unit;
	const sink = frame.signature;
	const baseY = restingY + (geometry.floorY - restingY) * sink;
	const tilt = HARBOR_TILT_RAD * sink;
	context.save();
	context.translate(geometry.centerX, baseY);
	context.rotate(tilt);
	context.beginPath();
	context.moveTo(-42 * u, 0);
	context.lineTo(38 * u, 0);
	context.lineTo(34 * u, 4 * u);
	context.lineTo(-38 * u, 4 * u);
	context.closePath();
	fill(frame, '120, 110, 80', 0.8);
	context.fill();
	context.lineWidth = 1.5;
	stroke(frame, LINE_RGB, 0.85);
	fill(frame, SHADOW_RGB, 0.55);
	for (const [left, width, height] of HARBOR_HOUSES) {
		context.beginPath();
		context.rect(left * u, -height * u, width * u, height * u);
		context.moveTo(left * u, -height * u);
		context.lineTo((left + width / 2) * u, -(height + 4) * u);
		context.lineTo((left + width) * u, -height * u);
		context.fill();
		context.stroke();
	}
	context.restore();
	return baseY;
}

type Piece = { startX: number; startY: number; angle: number; ring: number };

function assemblePieces(): Piece[] {
	return Array.from({ length: ASSEMBLE_PIECES }, (_, index) => ({
		startX: jitter(index, 3) * 120,
		startY: -20 + jitter(index, 4) * 50,
		angle: (index / ASSEMBLE_PIECES) * FULL_TURN * 3,
		ring: index % 3
	}));
}

const PIECES = assemblePieces();

/** 조립(8장): 앞 장 윤곽 조각이 흩어진 자리에서 고리 도시 자리로 모인다. 다 모이면 고리 도시. */
function paintAssemble(frame: PaintFrame): void {
	const { context, geometry } = frame;
	const u = geometry.unit;
	const gather = frame.signature;
	const cy = ringCenterY(geometry);
	context.lineWidth = 2;
	for (const piece of PIECES) {
		const radius = RING_RADII[piece.ring] * u;
		const targetX = geometry.centerX + Math.cos(piece.angle) * radius;
		const targetY = cy + Math.sin(piece.angle) * radius * RING_FLATNESS;
		const x =
			geometry.centerX +
			piece.startX * u +
			(targetX - geometry.centerX - piece.startX * u) * gather;
		const y = cy + piece.startY * u + (targetY - cy - piece.startY * u) * gather;
		stroke(frame, WALL_COLORS[piece.ring], 0.9);
		context.beginPath();
		context.moveTo(x - 2.5 * u, y);
		context.lineTo(x + 2.5 * u, y);
		context.stroke();
	}
	if (gather > 0.6) {
		const shown = { ...frame, alpha: frame.alpha * ((gather - 0.6) / 0.4) };
		paintRings(shown);
	}
}

/** 윤곽 하나를 그린다. 그린 윤곽의 위쪽 끝 y(px)를 돌려준다(화면 확인용). */
export function paintOutline(
	frame: PaintFrame,
	outline: OutlineId,
	canvasWidth: number,
	harborRestingY: number
): number | null {
	if (frame.alpha < 0.01) return null;
	const u = frame.geometry.unit;
	const floor = frame.geometry.floorY;
	switch (outline) {
		case 'none':
			return null;
		case 'rings':
			paintRings(frame);
			return ringCenterY(frame.geometry) - 10 * u;
		case 'walls':
			paintWalls(frame);
			return floor - 11 * u;
		case 'land':
			paintLand(frame, 0, canvasWidth);
			return floor - (HILL_HEIGHT + 6) * u;
		case 'alleys':
			paintAlleys(frame);
			return floor - 11 * u;
		case 'mosaic':
			paintMosaic(frame);
			return floor - 32 * u;
		case 'statue':
			paintStatue(frame);
			return floor - 49 * u;
		case 'harbor':
			return paintHarbor(frame, harborRestingY) - 30 * u;
		case 'assemble':
			paintAssemble(frame);
			return ringCenterY(frame.geometry) - 40 * u;
	}
}
