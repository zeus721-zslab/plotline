// 넘을 수 없는 선 데이터 해석(순수 함수): 발행 파일 bell_line 을 사건 → 기록(날짜 · 수량) 지도로 바꾼다.
// 한 사건 한 줄(event · year · month · day · value). year 밖의 칸은 없을 수 있다. 값 형식이 하나라도 다르면 null(화면은 불러오기 실패).
import type { CellValue, PublishedDataset } from '../../story/published.ts';

export const EVENT_IDS = [
	'einstein_lightquanta',
	'born_letter',
	'solvay_1927',
	'solvay_1930',
	'epr_paper',
	'einstein_died',
	'bohr_died',
	'bell_theorem',
	'chsh_paper',
	'freedman_clauser',
	'aspect_meets_bell',
	'aspect_fixed',
	'aspect_switching',
	'nobel_2022',
	'classical_bound',
	'quantum_bound',
	'switch_distance',
	'switch_separation',
	'photon_flight',
	'signal_time',
	'switch_interval'
] as const;
export type EventId = (typeof EVENT_IDS)[number];

export type EventRecord = {
	year: number;
	// 데이터에 없으면 null
	month: number | null;
	day: number | null;
	// 수량(정수. 점수는 ×10, 시간은 ns). 없으면 null
	value: number | null;
};

export type LineData = { events: Map<EventId, EventRecord> };

function isEventId(value: CellValue | undefined): value is EventId {
	return EVENT_IDS.some((id) => id === value);
}

function isInteger(value: CellValue | undefined): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

/** 없는 칸은 null, 정수가 아니면 undefined(형식 오류). */
function optionalInteger(value: CellValue | undefined): number | null | undefined {
	if (value === undefined) return null;
	return isInteger(value) ? value : undefined;
}

/** 사건 줄을 읽는다. 형식이 다른 줄이 있거나 같은 사건이 두 번 나오면 null. */
export function buildLineData(dataset: PublishedDataset): LineData | null {
	const events = new Map<EventId, EventRecord>();
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
	return { events };
}
