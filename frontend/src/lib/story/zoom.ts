// 시그니처 장면 확대 위치(순수 함수): 강조 칸들의 경계 상자를 영역 가운데로 옮기는 배율·이동량.
import { CELL_GAP_PX, GRID_COLUMNS, GRID_ROWS, periodicPosition } from './periodicTable.ts';

export type ZoomTransform = { scale: number; x: number; y: number };

export const NO_ZOOM: ZoomTransform = { scale: 1, x: 0, y: 0 };

const MAX_SCALE = 3;
// 확대한 경계 상자가 영역의 이 비율을 넘지 않게 한다(가장자리 여유).
const MAX_BOX_RATIO = 0.7;

type Box = { left: number; top: number; right: number; bottom: number };

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function cellBox(numbers: number[], cellSize: number): Box | null {
	const pitch = cellSize + CELL_GAP_PX;
	let box: Box | null = null;
	for (const atomicNumber of numbers) {
		const position = periodicPosition(atomicNumber);
		if (position === null) continue;
		const left = (position.column - 1) * pitch;
		const top = (position.row - 1) * pitch;
		const cell = { left, top, right: left + cellSize, bottom: top + cellSize };
		box =
			box === null
				? cell
				: {
						left: Math.min(box.left, cell.left),
						top: Math.min(box.top, cell.top),
						right: Math.max(box.right, cell.right),
						bottom: Math.max(box.bottom, cell.bottom)
					};
	}
	return box;
}

/**
 * 표 폭(px)과 강조 칸으로 확대 변환을 구한다(transform-origin 0 0 기준 translate 후 scale).
 * 경계 상자는 확대 후에도 영역 폭·높이의 70% 이하, 배율은 1~3배. 이동은 표 바깥이 보이지 않게 제한한다.
 */
export function zoomToCells(numbers: number[], gridWidth: number): ZoomTransform {
	const cellSize = (gridWidth - CELL_GAP_PX * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
	if (cellSize <= 0) return NO_ZOOM;
	const gridHeight = cellSize * GRID_ROWS + CELL_GAP_PX * (GRID_ROWS - 1);
	const box = cellBox(numbers, cellSize);
	if (box === null) return NO_ZOOM;

	const boxWidth = box.right - box.left;
	const boxHeight = box.bottom - box.top;
	const scale = clamp(
		Math.min((gridWidth * MAX_BOX_RATIO) / boxWidth, (gridHeight * MAX_BOX_RATIO) / boxHeight),
		1,
		MAX_SCALE
	);
	const centerX = (box.left + box.right) / 2;
	const centerY = (box.top + box.bottom) / 2;
	return {
		scale,
		x: clamp(gridWidth / 2 - centerX * scale, gridWidth * (1 - scale), 0),
		y: clamp(gridHeight / 2 - centerY * scale, gridHeight * (1 - scale), 0)
	};
}
