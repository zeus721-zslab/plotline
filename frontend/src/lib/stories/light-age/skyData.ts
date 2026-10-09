// 빛의 나이 스토리 데이터 해석(순수 함수): 발행 파일 두 개(sky_objects · earth_moments)를 화면이 쓰는 모양으로 바꾼다.
// 거리는 출처의 원래 값 그대로 받고, 반올림·한글 단위는 화면(lightTime.ts)에서 만든다.
import type { CellValue, PublishedDataset } from '../../story/published.ts';

export const DISTANCE_UNITS = ['km', '광년'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export const MOMENT_KINDS = ['빛이 떠날 때', '빛이 닿을 때'] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

export const TIME_KINDS = ['연도', '년 전'] as const;
export type TimeKind = (typeof TIME_KINDS)[number];

export type SkyObject = {
	id: string;
	nameKo: string;
	kind: string;
	distanceValue: number;
	distanceUnit: DistanceUnit;
	// true 면 반올림하지 않고 출처 값을 천 단위 쉼표로 그대로 보인다.
	showExact: boolean;
	distanceNote: string;
};

// 연도 표기 사건은 사건 실제 연도(year), 년 전 표기 사건은 약 몇 년 전(yearsAgo)만 갖는다.
export type MomentTime = { kind: '연도'; year: number } | { kind: '년 전'; yearsAgo: number };

export type EarthMoment = {
	id: string;
	objectId: string;
	momentKind: MomentKind;
	time: MomentTime;
	event: string;
};

function isDistanceUnit(value: CellValue | undefined): value is DistanceUnit {
	return DISTANCE_UNITS.some((unit) => unit === value);
}

function isMomentKind(value: CellValue | undefined): value is MomentKind {
	return MOMENT_KINDS.some((kind) => kind === value);
}

function isFiniteNumber(value: CellValue | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: CellValue | undefined): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

function toSkyObject(values: Record<string, CellValue>): SkyObject | null {
	const { object_id, name_ko, kind, distance_value, distance_unit, show_exact, distance_note } =
		values;
	if (
		typeof object_id !== 'string' ||
		typeof name_ko !== 'string' ||
		typeof kind !== 'string' ||
		!isFiniteNumber(distance_value) ||
		distance_value <= 0 ||
		!isDistanceUnit(distance_unit) ||
		typeof distance_note !== 'string'
	) {
		return null;
	}
	return {
		id: object_id,
		nameKo: name_ko,
		kind,
		distanceValue: distance_value,
		distanceUnit: distance_unit,
		// 정의상 선택 칸이라 없으면 반올림 표기
		showExact: show_exact === true,
		distanceNote: distance_note
	};
}

function toMomentTime(values: Record<string, CellValue>): MomentTime | null {
	if (values.time_kind === '연도') {
		return isInteger(values.year) ? { kind: '연도', year: values.year } : null;
	}
	if (values.time_kind === '년 전') {
		return isInteger(values.years_ago) && values.years_ago > 0
			? { kind: '년 전', yearsAgo: values.years_ago }
			: null;
	}
	return null;
}

function toEarthMoment(values: Record<string, CellValue>): EarthMoment | null {
	const { moment_id, object_id, moment_kind, event } = values;
	const time = toMomentTime(values);
	if (
		typeof moment_id !== 'string' ||
		typeof object_id !== 'string' ||
		!isMomentKind(moment_kind) ||
		typeof event !== 'string' ||
		time === null
	) {
		return null;
	}
	return { id: moment_id, objectId: object_id, momentKind: moment_kind, time, event };
}

function buildMap<T extends { id: string }>(
	dataset: PublishedDataset,
	convert: (values: Record<string, CellValue>) => T | null
): Map<string, T> | null {
	const result = new Map<string, T>();
	for (const row of dataset.rows) {
		const item = convert(row.values);
		if (item === null || result.has(item.id)) return null;
		result.set(item.id, item);
	}
	return result;
}

/** 천체 목록. 값 형식이 하나라도 다르면 null(화면은 불러오기 실패로 보인다). */
export function buildSkyObjects(dataset: PublishedDataset): Map<string, SkyObject> | null {
	return buildMap(dataset, toSkyObject);
}

/** 그때 지구 사건 목록. 값 형식이 하나라도 다르면 null. */
export function buildEarthMoments(dataset: PublishedDataset): Map<string, EarthMoment> | null {
	return buildMap(dataset, toEarthMoment);
}
