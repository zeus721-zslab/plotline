// 사건형 데이터 해석(순수 함수): 발행 묶음을 사건 → 기록(날짜 · 수량) 지도로 바꾼다. 6 · 7편이 같은 형식을 쓴다(D-45).
// 한 사건 한 줄(event · year · month · day · value). year 밖의 칸은 없을 수 있다. 값 형식이 하나라도 다르면 null(화면은 불러오기 실패).
import type { CellValue, PublishedDataset } from './published.ts';

export type EventRecord = {
	year: number;
	// 데이터에 없으면 null
	month: number | null;
	day: number | null;
	// 수량(정수. 소수 값은 편마다 정한 배율로 저장). 없으면 null
	value: number | null;
};

function isInteger(value: CellValue | undefined): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

/** 없는 칸은 null, 정수가 아니면 undefined(형식 오류). */
function optionalInteger(value: CellValue | undefined): number | null | undefined {
	if (value === undefined) return null;
	return isInteger(value) ? value : undefined;
}

/** 사건 줄을 읽는다. ids 밖의 사건이 있거나, 형식이 다른 줄이 있거나, 같은 사건이 두 번 나오면 null. */
export function buildEventMap<Id extends string>(
	dataset: PublishedDataset,
	ids: readonly Id[]
): Map<Id, EventRecord> | null {
	const isEventId = (value: CellValue | undefined): value is Id => ids.some((id) => id === value);
	const events = new Map<Id, EventRecord>();
	for (const row of dataset.rows) {
		const { event, year } = row.values;
		const month = optionalInteger(row.values.month);
		const day = optionalInteger(row.values.day);
		const value = optionalInteger(row.values.value);
		if (!isEventId(event) || !isInteger(year)) return null;
		if (month === undefined || day === undefined || value === undefined) return null;
		if (events.has(event)) return null;
		events.set(event, { year, month, day, value });
	}
	return events;
}
