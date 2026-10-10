// 그가 실패작이라 부른 밤 데이터 해석(순수 함수): 발행 파일 vangogh_starry_night 를 사건 → 날짜 지도로 바꾼다.
// 한 사건 한 줄(event · year · month · day). 월 · 일은 없을 수 있다. 값 형식이 하나라도 다르면 null(화면은 불러오기 실패).
import type { CellValue, PublishedDataset } from '../../story/published.ts';

export const EVENT_IDS = [
	'born',
	'ear',
	'arles_hospital',
	'admitted',
	'barred_window',
	'morning_star_letter',
	'painted',
	'theo_reply',
	'bernard_letter',
	'died',
	'theo_died',
	'moma_acquired',
	'kolmogorov',
	'turbulence_study'
] as const;
export type EventId = (typeof EVENT_IDS)[number];

export type EventDate = {
	year: number;
	// 데이터에 없으면 null
	month: number | null;
	day: number | null;
};

export type StarryData = { events: Map<EventId, EventDate> };

function isEventId(value: CellValue | undefined): value is EventId {
	return EVENT_IDS.some((id) => id === value);
}

function isInteger(value: CellValue | undefined): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

function optionalInteger(value: CellValue | undefined): number | null | undefined {
	if (value === undefined) return null;
	return isInteger(value) ? value : undefined;
}

/** 사건 줄을 읽는다. 형식이 다른 줄이 있거나 같은 사건이 두 번 나오면 null. */
export function buildStarryData(dataset: PublishedDataset): StarryData | null {
	const events = new Map<EventId, EventDate>();
	for (const row of dataset.rows) {
		const { event, year } = row.values;
		const month = optionalInteger(row.values.month);
		const day = optionalInteger(row.values.day);
		if (!isEventId(event) || !isInteger(year) || month === undefined || day === undefined) {
			return null;
		}
		if (events.has(event)) return null;
		events.set(event, { year, month, day });
	}
	return { events };
}
