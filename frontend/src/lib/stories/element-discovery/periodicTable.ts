// 주기율표 칸 위치(순수 함수). 1~7주기 18열 + 란타넘족·악티늄족은 아래 별도 2줄(위와 1줄 간격).

export const GRID_COLUMNS = 18;
const MAIN_PERIOD_COUNT = 7;
// 7주기 아래 빈 줄 1개를 두고 란타넘족·악티늄족 줄을 놓는다.
const LANTHANIDE_ROW = MAIN_PERIOD_COUNT + 2;
const ACTINIDE_ROW = MAIN_PERIOD_COUNT + 3;
export const GRID_ROWS = ACTINIDE_ROW;
// 칸 사이 간격. 표 그리기와 확대 위치 계산이 같은 값을 쓴다.
export const CELL_GAP_PX = 2;

// 아래 줄은 3족 자리(3열)부터 채운다.
const F_BLOCK_FIRST_COLUMN = 3;
// 6·7주기에서 f 구역 다음 원소(72·104)는 4족(4열)부터 이어진다.
const AFTER_F_BLOCK_COLUMN = 4;
const S_BLOCK_WIDTH = 2;
// 2·3주기는 s 구역 2칸 뒤 p 구역이 13족(13열)부터 시작한다.
const P_BLOCK_FIRST_COLUMN = 13;

type Period = { first: number; last: number };
type FBlock = { first: number; last: number; row: number };

const PERIODS: Period[] = [
	{ first: 1, last: 2 },
	{ first: 3, last: 10 },
	{ first: 11, last: 18 },
	{ first: 19, last: 36 },
	{ first: 37, last: 54 },
	{ first: 55, last: 86 },
	{ first: 87, last: 118 }
];

const F_BLOCKS: FBlock[] = [
	{ first: 57, last: 71, row: LANTHANIDE_ROW },
	{ first: 89, last: 103, row: ACTINIDE_ROW }
];

export const LAST_ATOMIC_NUMBER = PERIODS[PERIODS.length - 1].last;

export type GridPosition = { row: number; column: number };

const FIRST_PERIOD_LENGTH = 2;
const SHORT_PERIOD_LENGTH = 8;

// f 구역이 아닌 원소의 열. f 구역 원소는 periodicPosition 이 먼저 아래 줄로 보낸다.
function columnInPeriod(atomicNumber: number, period: Period): number {
	const offset = atomicNumber - period.first;
	const periodLength = period.last - period.first + 1;
	switch (periodLength) {
		case FIRST_PERIOD_LENGTH:
			return offset === 0 ? 1 : GRID_COLUMNS;
		case SHORT_PERIOD_LENGTH:
			return offset < S_BLOCK_WIDTH ? offset + 1 : P_BLOCK_FIRST_COLUMN + (offset - S_BLOCK_WIDTH);
		case GRID_COLUMNS:
			return offset + 1;
		default: {
			// 6·7주기(32칸): 3족 한 칸 자리에 f 구역 15개가 들어가 아래 줄로 빠진다.
			if (offset < S_BLOCK_WIDTH) return offset + 1;
			const fBlockLength = periodLength - GRID_COLUMNS + 1;
			return AFTER_F_BLOCK_COLUMN + (offset - S_BLOCK_WIDTH - fBlockLength);
		}
	}
}

/** 원자 번호의 격자 위치(1부터 시작하는 행·열). 범위 밖이면 null. */
export function periodicPosition(atomicNumber: number): GridPosition | null {
	const fBlock = F_BLOCKS.find(
		(block) => atomicNumber >= block.first && atomicNumber <= block.last
	);
	if (fBlock !== undefined) {
		return { row: fBlock.row, column: F_BLOCK_FIRST_COLUMN + (atomicNumber - fBlock.first) };
	}
	const periodIndex = PERIODS.findIndex(
		(period) => atomicNumber >= period.first && atomicNumber <= period.last
	);
	if (periodIndex === -1) return null;
	return { row: periodIndex + 1, column: columnInPeriod(atomicNumber, PERIODS[periodIndex]) };
}
