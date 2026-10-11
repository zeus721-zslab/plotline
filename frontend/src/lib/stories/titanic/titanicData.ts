// 마지막 2시간 40분 데이터 해석(순수 함수): 발행 파일 titanic_last_night 를 사건 → 기록(날짜 · 선박 시각 · 수량) 지도로 바꾼다.
// 한 사건 한 줄(event · year · month · day · hour · minute · value). year 밖의 칸은 없을 수 있다. 값 형식이 하나라도 다르면 null.
import type { CellValue, PublishedDataset } from '../../story/published.ts';

export const EVENT_IDS = [
	'departed',
	'phillips_born',
	'bride_born',
	'ice_warnings',
	'californian_stopped',
	'evans_off',
	'collision',
	'first_cqd',
	'first_sos',
	'carpathia_heard',
	'carpathia_distance',
	'lifeboats',
	'lifeboat_capacity',
	'aboard',
	'left_in_boats',
	'last_clear_signal',
	'released',
	'last_signal',
	'lights_out',
	'sank',
	'deaths',
	'aurora',
	'carpathia_arrived',
	'venus_last',
	'icebergs',
	'rescue_done',
	'survivors',
	'wreck_found',
	'wreck_depth',
	'position_error'
] as const;
export type EventId = (typeof EVENT_IDS)[number];

export type EventRecord = {
	year: number;
	// 데이터에 없으면 null
	month: number | null;
	day: number | null;
	// 선박 시각(1912년 4월, GMT − 2시간 58분)
	hour: number | null;
	minute: number | null;
	value: number | null;
};

export type TitanicData = { events: Map<EventId, EventRecord> };

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
export function buildTitanicData(dataset: PublishedDataset): TitanicData | null {
	const events = new Map<EventId, EventRecord>();
	for (const row of dataset.rows) {
		const { event, year } = row.values;
		const month = optionalInteger(row.values.month);
		const day = optionalInteger(row.values.day);
		const hour = optionalInteger(row.values.hour);
		const minute = optionalInteger(row.values.minute);
		const value = optionalInteger(row.values.value);
		if (!isEventId(event) || !isInteger(year)) return null;
		if (
			month === undefined ||
			day === undefined ||
			hour === undefined ||
			minute === undefined ||
			value === undefined
		) {
			return null;
		}
		if (events.has(event)) return null;
		events.set(event, { year, month, day, hour, minute, value });
	}
	return { events };
}
